package daemon

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type RPCRequest struct {
	ID     int64  `json:"id"`
	Method string `json:"method"`
	Params any    `json:"params"`
}

type RPCResponse struct {
	ID     int64           `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *RPCError       `json:"error,omitempty"`
}

type RPCError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type pendingRequest struct {
	reply chan *RPCResponse
	timer *time.Timer
}

type Supervisor struct {
	rootPath  string
	dataPath  string
	engineCmd *exec.Cmd
	stdin     io.WriteCloser
	mu        sync.Mutex
	pending   map[int64]*pendingRequest
	seq       atomic.Int64
	closing   atomic.Bool
}

func NewSupervisor(rootPath, dataPath string) *Supervisor {
	return &Supervisor{
		rootPath: rootPath,
		dataPath: dataPath,
		pending:  make(map[int64]*pendingRequest),
	}
}

func (s *Supervisor) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 优先使用独立引擎，其次使用项目虚拟环境或随包 Python。
	var exePath string
	var args []string

	engineSuffix := ""
	pythonDirectory := "bin"
	pythonExecutable := "python"
	pythonFallback := "python3"
	if runtime.GOOS == "windows" {
		engineSuffix = ".exe"
		pythonDirectory = "Scripts"
		pythonExecutable = "python.exe"
		pythonFallback = "python"
	}
	binaryEngine := filepath.Join(s.rootPath, "bin", "yaha-engine"+engineSuffix)
	if _, err := os.Stat(binaryEngine); err != nil {
		binaryEngine = filepath.Join(s.rootPath, "bin", "hopmio-engine"+engineSuffix)
	}
	if _, err := os.Stat(binaryEngine); err == nil {
		exePath = binaryEngine
	} else {
		pyCandidate := os.Getenv("YAHA_PYTHON")
		if pyCandidate == "" {
			venvPy := filepath.Join(s.rootPath, ".venv", pythonDirectory, pythonExecutable)
			if _, err := os.Stat(venvPy); err == nil {
				pyCandidate = venvPy
			} else {
				if runtime.GOOS == "windows" {
					for _, bundledPy := range []string{
						filepath.Join(s.rootPath, "python", "python.exe"),
						filepath.Join(s.rootPath, "..", "python", "python.exe"),
					} {
						if _, err := os.Stat(bundledPy); err == nil {
							pyCandidate = bundledPy
							break
						}
					}
					if pyCandidate == "" {
						pyCandidate = pythonFallback
					}
				} else {
					pyCandidate = pythonFallback
				}
			}
		}
		exePath = pyCandidate
		args = []string{"-u", "-m", "yaha"}
	}

	cmd := exec.Command(exePath, args...)
	cmd.Dir = s.rootPath
	cmd.Env = append(os.Environ(),
		"PYTHONPATH="+filepath.Join(s.rootPath, "backend"),
		"YAHA_DATA_DIR="+s.dataPath,
		"PYTHONIOENCODING=utf-8",
	)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to open stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to open stdout pipe: %w", err)
	}

	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start engine (%s): %w", exePath, err)
	}

	s.engineCmd = cmd
	s.stdin = stdin

	// 异步读取响应行
	go s.readLoop(stdout)

	// 异步监听进程意外退出
	go func() {
		err := cmd.Wait()
		if !s.closing.Load() {
			log.Printf("[daemon] engine process exited: %v", err)
			s.failAll(errors.New("engine process exited unexpectedly"))
		}
	}()

	log.Printf("[daemon] engine started successfully (%s)", exePath)
	return nil
}

func (s *Supervisor) readLoop(r io.Reader) {
	scanner := bufio.NewScanner(r)
	// 允许单行大响应 (高达 350MB)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 350*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var resp RPCResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			continue // 忽略非协议行
		}

		s.mu.Lock()
		req, exists := s.pending[resp.ID]
		if exists {
			delete(s.pending, resp.ID)
		}
		s.mu.Unlock()

		if exists && req != nil {
			req.timer.Stop()
			req.reply <- &resp
		}
	}

	if err := scanner.Err(); err != nil && !s.closing.Load() {
		log.Printf("[daemon] stdout reader error: %v", err)
	}
}

func (s *Supervisor) Call(method string, params any) (json.RawMessage, error) {
	id := s.seq.Add(1)
	req := RPCRequest{
		ID:     id,
		Method: method,
		Params: params,
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}
	data = append(data, '\n')

	replyChan := make(chan *RPCResponse, 1)
	timer := time.NewTimer(120 * time.Second)

	s.mu.Lock()
	if s.stdin == nil {
		s.mu.Unlock()
		return nil, errors.New("engine is not running")
	}
	s.pending[id] = &pendingRequest{reply: replyChan, timer: timer}
	_, err = s.stdin.Write(data)
	s.mu.Unlock()

	if err != nil {
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
		return nil, fmt.Errorf("failed to write to engine: %w", err)
	}

	select {
	case resp := <-replyChan:
		if resp.Error != nil {
			return nil, errors.New(resp.Error.Message)
		}
		return resp.Result, nil
	case <-timer.C:
		s.mu.Lock()
		delete(s.pending, id)
		s.mu.Unlock()
		return nil, errors.New("engine request timed out (120s)")
	}
}

func (s *Supervisor) failAll(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for id, req := range s.pending {
		req.timer.Stop()
		req.reply <- &RPCResponse{
			ID: id,
			Error: &RPCError{
				Code:    "ENGINE_EXITED",
				Message: err.Error(),
			},
		}
	}
	s.pending = make(map[int64]*pendingRequest)
}

func (s *Supervisor) Close() {
	s.closing.Store(true)
	s.mu.Lock()

	if s.stdin != nil {
		_ = s.stdin.Close()
	}
	if s.engineCmd != nil && s.engineCmd.Process != nil {
		if runtime.GOOS == "windows" {
			pid := strconv.Itoa(s.engineCmd.Process.Pid)
			if err := exec.Command("taskkill", "/PID", pid, "/T", "/F").Run(); err != nil {
				_ = s.engineCmd.Process.Kill()
			}
		} else {
			_ = s.engineCmd.Process.Kill()
		}
	}
	s.mu.Unlock()
	s.failAll(errors.New("engine supervisor closed"))
}

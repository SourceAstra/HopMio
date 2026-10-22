package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"hopmio/core-go/daemon"
)

// 公开开放的 RPC 方法白名单（对标 shared/methods.ts）
var publicMethods = map[string]bool{
	"bootstrap":                 true,
	"project.create":            true,
	"project.get":               true,
	"project.list":              true,
	"project.history":           true,
	"project.restore":           true,
	"project.select_revision":   true,
	"project.update":            true,
	"project.delete":            true,
	"project.delete_revision":   true,
	"revision.delete":           true,
	"project.export":            true,
	"asset.upload":              true,
	"asset.delete":              true,
	"asset.list":                true,
	"materials.get":             true,
	"materials.save":            true,
	"idea.interpret":            true,
	"idea.adjustment":           true,
	"idea.converse":             true,
	"model.generate":            true,
	"model.adjust":              true,
	"model.parameters.describe": true,
	"model.parameters.apply":    true,
	"model.generators.list":     true,
	"model.generators.apply":    true,
	"model.scripts.describe":    true,
	"model.scripts.inspect":     true,
	"model.scripts.save":        true,
	"model.scripts.preview":     true,
	"model.scripts.adopt":       true,
	"model.plan":                true,
	"model.check":               true,
	"model.slice":               true,
	"job.get":                   true,
	"job.cancel":                true,
	"job.list":                  true,
	"profile.save":              true,
	"settings.get":              true,
	"settings.unlock":           true,
	"settings.update":           true,
	"settings.models.discover":  true,
	"settings.models.test":      true,
	"studio.open":               true,
	"conversation.get":          true,
	"conversation.save":         true,
	"workshop.templates":        true,
	"model.repair":              true,
	"project.import":            true,
}

type Server struct {
	sup    *daemon.Supervisor
	webDir string
	mux    *http.ServeMux
}

func NewServer(sup *daemon.Supervisor, webDir string) *Server {
	s := &Server{
		sup:    sup,
		webDir: webDir,
		mux:    http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("/api/rpc", s.handleRPC)
	s.mux.HandleFunc("/api/blender/recompute", s.handleRecompute)
	s.mux.HandleFunc("/api/assets/", s.handleAssets)

	// 静态文件服务
	fs := http.FileServer(http.Dir(s.webDir))
	s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		// 检查本地静态文件是否存在，若不存在则回退至 index.html (SPA 支持)
		target := filepath.Join(s.webDir, filepath.Clean(r.URL.Path))
		if _, err := os.Stat(target); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(s.webDir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}

func (s *Server) handleRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// 限制请求体上限 350MB
	r.Body = http.MaxBytesReader(w, r.Body, 350*1024*1024)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":{"message":"上传内容太大或读取失败。"}}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error":{"message":"JSON 格式非法。"}}`, http.StatusBadRequest)
		return
	}

	s.serveMethod(w, r, req.Method, req.Params)
}

func (s *Server) handleRecompute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	params, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64*1024))
	if err != nil || !json.Valid(params) {
		http.Error(w, `{"error":{"message":"参数请求无效或超过大小限制。"}}`, http.StatusBadRequest)
		return
	}
	s.serveMethod(w, r, "model.parameters.apply", params)
}

func (s *Server) serveMethod(w http.ResponseWriter, r *http.Request, method string, params json.RawMessage) {
	if !publicMethods[method] {
		http.Error(w, `{"error":{"message":"未开放的操作：`+method+`"}}`, http.StatusForbidden)
		return
	}

	if (method == "studio.open" || method == "settings.update" || method == "settings.models.discover" || method == "settings.models.test") && !localAppRequest(r) {
		http.Error(w, `{"error":{"message":"请从本机呀哈造物页面执行此操作。"}}`, http.StatusForbidden)
		return
	}
	result, err := s.sup.Call(method, params)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]string{"message": err.Error()},
		})
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]any{
		"result": result,
	})
}

func (s *Server) handleAssets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// 提取 asset ID
	assetID := strings.TrimPrefix(r.URL.Path, "/api/assets/")
	assetID, _ = url.PathUnescape(assetID)
	assetID = strings.Split(assetID, "?")[0]

	if assetID == "" {
		http.NotFound(w, r)
		return
	}

	res, err := s.sup.Call("asset.path", map[string]string{"id": assetID})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	var assetInfo struct {
		Path string `json:"path"`
		Mime string `json:"mime"`
	}
	if err := json.Unmarshal(res, &assetInfo); err != nil {
		http.Error(w, "Invalid asset info", http.StatusInternalServerError)
		return
	}

	file, err := os.Open(assetInfo.Path)
	if err != nil {
		http.Error(w, "Asset file not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	if assetInfo.Mime != "" {
		w.Header().Set("Content-Type", assetInfo.Mime)
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	_, _ = io.Copy(w, file)
}

func (s *Server) Start(addr string) error {
	log.Printf("[server] HTTP listening on %s (serving web: %s)", addr, s.webDir)
	return http.ListenAndServe(addr, s.mux)
}

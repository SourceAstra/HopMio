package daemon

import (
	"io"
	"strings"
	"testing"
	"time"
)

// 模拟引擎等待上一条响应被宿主读取，暂时无法继续读取下一条大请求。
type blockedEngineInput struct {
	entered chan struct{}
	release chan struct{}
}

func (w *blockedEngineInput) Write(data []byte) (int, error) {
	close(w.entered)
	<-w.release
	return len(data), nil
}

func (w *blockedEngineInput) Close() error { return nil }

func TestResponseDispatchWhileRequestWriteBlocked(t *testing.T) {
	input := &blockedEngineInput{entered: make(chan struct{}), release: make(chan struct{})}
	previous := &pendingRequest{reply: make(chan *RPCResponse, 1), timer: time.NewTimer(time.Minute)}
	defer previous.timer.Stop()
	s := &Supervisor{stdin: input, pending: map[int64]*pendingRequest{100: previous}}
	done := make(chan error, 1)
	go func() {
		_, err := s.Call("conversation.save", strings.Repeat("x", 128*1024))
		done <- err
	}()
	select {
	case <-input.entered:
	case <-time.After(time.Second):
		t.Fatal("请求未进入管道写入")
	}
	readerDone := make(chan struct{})
	go func() {
		s.readLoop(io.NopCloser(strings.NewReader("{\"id\":100,\"result\":{}}\n{\"id\":1,\"result\":{}}\n")))
		close(readerDone)
	}()
	select {
	case <-previous.reply:
	case <-time.After(time.Second):
		t.Error("下一条请求写入阻塞时，上一条响应无法分发：收发共用锁造成死锁")
	}
	close(input.release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("释放写入后请求未完成")
	}
	<-readerDone
}

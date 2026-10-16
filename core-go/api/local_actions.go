package api

import (
	"mime"
	"net"
	"net/http"
	"net/url"
)

// 本机应用操作只接收本机页面的 JSON 请求，阻止其他网站触发程序启动。
func localAppRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil || (host != "localhost" && host != "127.0.0.1" && host != "::1") {
		return false
	}
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || !net.ParseIP(remote).IsLoopback() {
		return false
	}
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Scheme != "http" || parsed.Host != r.Host || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
			return false
		}
	}
	return true
}

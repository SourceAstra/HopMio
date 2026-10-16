package api

import (
	"net/http/httptest"
	"testing"
)

func TestLocalAppRequest(t *testing.T) {
	for _, test := range []struct {
		name, origin, site, media, host, remote string
		want                                    bool
	}{
		{"local page", "http://127.0.0.1:5173", "same-origin", "application/json", "127.0.0.1:5173", "127.0.0.1:12345", true},
		{"local client", "", "", "application/json; charset=utf-8", "localhost:5173", "127.0.0.1:12345", true},
		{"other website", "https://example.com", "cross-site", "application/json", "127.0.0.1:5173", "127.0.0.1:12345", false},
		{"simple form", "", "", "text/plain", "127.0.0.1:5173", "127.0.0.1:12345", false},
		{"dns rebind", "http://evil.test:5173", "same-origin", "application/json", "evil.test:5173", "127.0.0.1:12345", false},
		{"remote caller", "", "", "application/json", "127.0.0.1:5173", "192.0.2.1:12345", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://"+test.host+"/api/rpc", nil)
			r.RemoteAddr = test.remote
			r.Header.Set("Origin", test.origin)
			r.Header.Set("Sec-Fetch-Site", test.site)
			r.Header.Set("Content-Type", test.media)
			if got := localAppRequest(r); got != test.want {
				t.Fatalf("got %v, want %v", got, test.want)
			}
		})
	}
}

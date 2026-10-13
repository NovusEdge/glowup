package spotify

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const testClientID = "0123456789abcdef0123456789abcdef"

// tokenServer answers the token endpoint and records each form it got.
type tokenServer struct {
	mu    sync.Mutex
	forms []url.Values
	reply func(form url.Values) (int, string)
}

func (s *tokenServer) start(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		s.mu.Lock()
		s.forms = append(s.forms, r.PostForm)
		s.mu.Unlock()
		code, body := s.reply(r.PostForm)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (s *tokenServer) calls() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.forms) }

// form reads under the lock: the race detector sees no ordering through the HTTP round trip.
func (s *tokenServer) form(i int) url.Values { s.mu.Lock(); defer s.mu.Unlock(); return s.forms[i] }

const grant = `{"access_token":"at-1","token_type":"Bearer","scope":"user-read-playback-state","expires_in":3600,"refresh_token":"rt-1"}`

// startLogin runs a Login in the background and returns the authorize URL it printed, its notice lines and its result.
func startLogin(t *testing.T, srv *httptest.Server, dir string, wait time.Duration) (*url.URL, *bufio.Scanner, chan error, int) {
	t.Helper()
	// the paste file sits beside the token file, and Login creates nothing before its exchange
	if err := os.MkdirAll(filepath.Join(dir, "glowup"), 0o700); err != nil {
		t.Fatal(err)
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	pr, pw := io.Pipe()
	ctx, cancel := context.WithTimeout(context.Background(), wait)
	t.Cleanup(cancel)
	done := make(chan error, 1)
	l := Login{
		Auth:      Auth{Client: srv.Client(), TokenURL: srv.URL, Now: func() time.Time { return time.UnixMilli(1_000_000) }},
		ClientID:  testClientID,
		Out:       filepath.Join(dir, "glowup", "spotify.json"),
		PasteFile: filepath.Join(dir, "glowup", "spotify-paste"),
		Listener:  ln,
		Open:      func(string) error { return nil },
		Notice:    pw,
		Poll:      20 * time.Millisecond,
	}
	go func() { done <- l.Run(ctx); pw.Close() }()
	lines := bufio.NewScanner(pr)
	if !lines.Scan() {
		t.Fatal("no authorize URL printed")
	}
	u, err := url.Parse(lines.Text())
	if err != nil {
		t.Fatal(err)
	}
	return u, lines, done, ln.Addr().(*net.TCPAddr).Port
}

func TestChallengeMatchesRFC7636(t *testing.T) {
	if got := challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"); got != "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" {
		t.Fatalf("challenge = %s", got)
	}
}

func TestAuthorizeURL(t *testing.T) {
	u, _ := url.Parse(AuthorizeURL(testClientID, "http://127.0.0.1:5000/callback", "ch", "st"))
	q := u.Query()
	if u.Host != "accounts.spotify.com" || u.Path != "/authorize" {
		t.Fatalf("url = %s", u)
	}
	want := map[string]string{"client_id": testClientID, "response_type": "code", "redirect_uri": "http://127.0.0.1:5000/callback", "code_challenge_method": "S256", "code_challenge": "ch", "state": "st", "scope": Scopes}
	for k, v := range want {
		if q.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, q.Get(k), v)
		}
	}
}

func TestLoginLoopback(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, grant }}
	srv := ts.start(t)
	dir := t.TempDir()
	auth, _, done, port := startLogin(t, srv, dir, 5*time.Second)
	q := auth.Query()
	if q.Get("redirect_uri") != "http://127.0.0.1:"+itoa(port)+"/callback" {
		t.Fatalf("redirect_uri = %s", q.Get("redirect_uri"))
	}
	// a request with another state is refused and the login keeps waiting
	bad, err := http.Get("http://127.0.0.1:" + itoa(port) + "/callback?code=x&state=nope")
	if err != nil {
		t.Fatal(err)
	}
	bad.Body.Close()
	if bad.StatusCode != 400 {
		t.Fatalf("wrong state answered %d", bad.StatusCode)
	}
	resp, err := http.Get("http://127.0.0.1:" + itoa(port) + "/callback?code=the-code&state=" + url.QueryEscape(q.Get("state")))
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(page), "Connected") {
		t.Fatalf("page %d %s", resp.StatusCode, page)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	form := ts.form(0)
	if form.Get("grant_type") != "authorization_code" || form.Get("code") != "the-code" || form.Get("client_id") != testClientID || form.Get("redirect_uri") != q.Get("redirect_uri") {
		t.Fatalf("form = %v", form)
	}
	if challenge(form.Get("code_verifier")) != q.Get("code_challenge") || len(form.Get("code_verifier")) != 86 {
		t.Fatalf("verifier does not match the challenge")
	}
	tok, err := ReadTokens(filepath.Join(dir, "glowup", "spotify.json"))
	if err != nil {
		t.Fatal(err)
	}
	if tok.AccessToken != "at-1" || tok.RefreshToken != "rt-1" || tok.ClientID != testClientID || tok.ExpiresAt != 1_000_000+3_600_000 || tok.ConnectedAt != 1_000_000 || tok.Gen != 1 || tok.Format != TokensFormat {
		t.Fatalf("tokens = %+v", tok)
	}
	if runtime.GOOS != "windows" {
		if st, _ := os.Stat(filepath.Join(dir, "glowup", "spotify.json")); st.Mode().Perm() != 0o600 {
			t.Fatalf("mode %v", st.Mode().Perm())
		}
	}
}

func TestLoginPaste(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, grant }}
	srv := ts.start(t)
	dir := t.TempDir()
	auth, _, done, port := startLogin(t, srv, dir, 5*time.Second)
	paste := filepath.Join(dir, "glowup", "spotify-paste")
	addr := "http://127.0.0.1:" + itoa(port) + "/callback?code=pasted&state=" + url.QueryEscape(auth.Query().Get("state"))
	if err := os.WriteFile(paste, []byte(addr+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if ts.form(0).Get("code") != "pasted" {
		t.Fatalf("form = %v", ts.form(0))
	}
	if _, err := os.Stat(paste); !os.IsNotExist(err) {
		t.Fatal("the paste file was left behind")
	}
}

func TestLoginPasteWrongState(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, grant }}
	srv := ts.start(t)
	dir := t.TempDir()
	auth, lines, done, port := startLogin(t, srv, dir, 5*time.Second)
	paste := filepath.Join(dir, "glowup", "spotify-paste")
	if err := os.WriteFile(paste, []byte("https://example.com/not-it"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !lines.Scan() || !strings.Contains(lines.Text(), "not from this login") {
		t.Fatalf("notice = %q", lines.Text())
	}
	addr := "http://127.0.0.1:" + itoa(port) + "/callback?code=ok&state=" + url.QueryEscape(auth.Query().Get("state"))
	if err := os.WriteFile(paste, []byte(addr), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if ts.calls() != 1 {
		t.Fatalf("token calls = %d", ts.calls())
	}
}

func TestLoginRefused(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, grant }}
	srv := ts.start(t)
	auth, _, done, port := startLogin(t, srv, t.TempDir(), 5*time.Second)
	resp, err := http.Get("http://127.0.0.1:" + itoa(port) + "/callback?error=access_denied&state=" + url.QueryEscape(auth.Query().Get("state")))
	if err == nil {
		resp.Body.Close()
	}
	if err := <-done; err == nil || !strings.Contains(err.Error(), "access_denied") {
		t.Fatalf("err = %v", err)
	}
	if ts.calls() != 0 {
		t.Fatal("a refused login exchanged a code")
	}
}

func TestLoginExchangeError(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) {
		return 400, `{"error":"invalid_client","error_description":"Invalid client"}`
	}}
	srv := ts.start(t)
	auth, _, done, port := startLogin(t, srv, t.TempDir(), 5*time.Second)
	resp, err := http.Get("http://127.0.0.1:" + itoa(port) + "/callback?code=c&state=" + url.QueryEscape(auth.Query().Get("state")))
	if err == nil {
		resp.Body.Close()
	}
	if err := <-done; err == nil || !strings.Contains(err.Error(), "Invalid client") {
		t.Fatalf("err = %v", err)
	}
}

func TestLoginTimesOut(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, grant }}
	srv := ts.start(t)
	_, _, done, _ := startLogin(t, srv, t.TempDir(), 100*time.Millisecond)
	if err := <-done; err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("err = %v", err)
	}
}

func TestLoginSecondCallbackDoesNotHoldTheShutdown(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) {
		time.Sleep(300 * time.Millisecond)
		return 200, grant
	}}
	srv := ts.start(t)
	auth, _, done, port := startLogin(t, srv, t.TempDir(), 10*time.Second)
	cb := "http://127.0.0.1:" + itoa(port) + "/callback?code=c&state=" + url.QueryEscape(auth.Query().Get("state"))
	start := time.Now()
	go func() {
		if resp, err := http.Get(cb); err == nil {
			resp.Body.Close()
		}
	}()
	time.Sleep(100 * time.Millisecond)
	go func() {
		if resp, err := http.Get(cb); err == nil {
			resp.Body.Close()
		}
	}()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	// Shutdown waits up to 2s for a handler still blocked on the first run's channel
	if d := time.Since(start); d > 1500*time.Millisecond {
		t.Fatalf("Run took %v", d)
	}
}

func TestWriteTokensLeavesNoTempFileOnFailure(t *testing.T) {
	dir := t.TempDir()
	// a non-empty directory at the target makes the rename fail
	target := filepath.Join(dir, "spotify.json")
	if err := os.MkdirAll(filepath.Join(target, "keep"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := WriteTokens(target, Tokens{Format: TokensFormat, AccessToken: "x"}); err == nil {
		t.Fatal("expected the rename to fail")
	}
	left, _ := filepath.Glob(filepath.Join(dir, ".spotify-*"))
	if len(left) != 0 {
		t.Fatalf("temp files left: %v", left)
	}
}

func TestLoginMainRefusesABadClientID(t *testing.T) {
	var errb strings.Builder
	if code := LoginMain([]string{"--client-id", "not-hex", "--out", filepath.Join(t.TempDir(), "s.json")}, io.Discard, &errb); code != 2 {
		t.Fatalf("exit %d", code)
	}
	if !strings.Contains(errb.String(), "32 hex") {
		t.Fatalf("stderr = %q", errb.String())
	}
}

func TestReadTokensNewerFormat(t *testing.T) {
	p := filepath.Join(t.TempDir(), "spotify.json")
	b, _ := json.Marshal(map[string]any{"format": TokensFormat + 1, "accessToken": "x"})
	_ = os.WriteFile(p, b, 0o600)
	if _, err := ReadTokens(p); err == nil || !strings.Contains(err.Error(), "newer") {
		t.Fatalf("err = %v", err)
	}
}

func itoa(n int) string { return strconv.Itoa(n) }

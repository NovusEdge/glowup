package spotify

import (
	"context"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func seed(t *testing.T, gen int) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "glowup", "spotify.json")
	if err := WriteTokens(p, Tokens{Format: 1, ClientID: testClientID, AccessToken: "old-at", RefreshToken: "old-rt", ExpiresAt: 1, ConnectedAt: 1, Gen: gen}); err != nil {
		t.Fatal(err)
	}
	return p
}

func authFor(ts *tokenServer, t *testing.T) Auth {
	srv := ts.start(t)
	return Auth{Client: srv.Client(), TokenURL: srv.URL, Now: func() time.Time { return time.UnixMilli(5_000_000) }}
}

func TestRefreshRotates(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) {
		return 200, `{"access_token":"new-at","expires_in":3600,"refresh_token":"new-rt","scope":"s"}`
	}}
	p := seed(t, 4)
	if err := Refresh(context.Background(), authFor(ts, t), p, 4); err != nil {
		t.Fatal(err)
	}
	tok, _ := ReadTokens(p)
	if tok.AccessToken != "new-at" || tok.RefreshToken != "new-rt" || tok.Gen != 5 || tok.ExpiresAt != 5_000_000+3_600_000 {
		t.Fatalf("tokens = %+v", tok)
	}
	f := ts.form(0)
	if f.Get("grant_type") != "refresh_token" || f.Get("refresh_token") != "old-rt" || f.Get("client_id") != testClientID {
		t.Fatalf("form = %v", f)
	}
	if runtime.GOOS != "windows" {
		if st, _ := os.Stat(p); st.Mode().Perm() != 0o600 {
			t.Fatalf("mode %v", st.Mode().Perm())
		}
	}
}

func TestRefreshKeepsTheOldRefreshToken(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, `{"access_token":"new-at","expires_in":3600}` }}
	p := seed(t, 1)
	if err := Refresh(context.Background(), authFor(ts, t), p, 1); err != nil {
		t.Fatal(err)
	}
	if tok, _ := ReadTokens(p); tok.RefreshToken != "old-rt" || tok.AccessToken != "new-at" {
		t.Fatalf("tokens = %+v", tok)
	}
}

func TestRefreshSkipsWhenTheGenerationMoved(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, `{"access_token":"x","expires_in":3600}` }}
	p := seed(t, 7)
	if err := Refresh(context.Background(), authFor(ts, t), p, 6); err != nil {
		t.Fatal(err)
	}
	if ts.calls() != 0 {
		t.Fatal("refreshed a generation another run had already refreshed")
	}
}

func TestRefreshInvalidGrant(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) {
		return 400, `{"error":"invalid_grant","error_description":"Refresh token revoked"}`
	}}
	p := seed(t, 1)
	if err := Refresh(context.Background(), authFor(ts, t), p, 1); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("err = %v", err)
	}
	if tok, _ := ReadTokens(p); tok.AccessToken != "old-at" {
		t.Fatal("a refused refresh rewrote the file")
	}
}

func TestRefreshConcurrentOneCall(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) {
		time.Sleep(100 * time.Millisecond)
		return 200, `{"access_token":"new-at","expires_in":3600,"refresh_token":"new-rt"}`
	}}
	p := seed(t, 2)
	a := authFor(ts, t)
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func(i int) { defer wg.Done(); errs[i] = Refresh(context.Background(), a, p, 2) }(i)
	}
	wg.Wait()
	if errs[0] != nil || errs[1] != nil {
		t.Fatalf("errs = %v", errs)
	}
	if ts.calls() != 1 {
		t.Fatalf("token calls = %d", ts.calls())
	}
	if tok, _ := ReadTokens(p); tok.Gen != 3 || tok.RefreshToken != "new-rt" {
		t.Fatalf("tokens = %+v", tok)
	}
}

func TestRefreshTakesAStaleLock(t *testing.T) {
	ts := &tokenServer{reply: func(url.Values) (int, string) { return 200, `{"access_token":"new-at","expires_in":3600}` }}
	p := seed(t, 1)
	if err := os.WriteFile(p+".lock", nil, 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Minute)
	if err := os.Chtimes(p+".lock", old, old); err != nil {
		t.Fatal(err)
	}
	if err := Refresh(context.Background(), authFor(ts, t), p, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(p + ".lock"); !os.IsNotExist(err) {
		t.Fatal("the lock was left behind")
	}
}

func TestRefreshMainExitCodes(t *testing.T) {
	var errb strings.Builder
	if code := RefreshMain([]string{"--file", filepath.Join(t.TempDir(), "missing.json"), "--if-gen", "1"}, io.Discard, &errb); code != 1 {
		t.Fatalf("missing file: exit %d", code)
	}
	if code := RefreshMain([]string{"--file", "x"}, io.Discard, io.Discard); code != 2 {
		t.Fatalf("no --if-gen: exit %d", code)
	}
}

func TestLogoutWaitsForARunningRefresh(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	ts := &tokenServer{reply: func(url.Values) (int, string) {
		close(entered)
		<-release
		return 200, `{"access_token":"new-at","expires_in":3600}`
	}}
	p := seed(t, 1)
	a := authFor(ts, t)
	refreshed := make(chan error, 1)
	go func() { refreshed <- Refresh(context.Background(), a, p, 1) }()
	<-entered
	loggedOut := make(chan int, 1)
	go func() { loggedOut <- LogoutMain([]string{"--file", p}, io.Discard, io.Discard) }()
	select {
	case <-loggedOut:
		t.Fatal("logout did not wait for the refresh")
	case <-time.After(200 * time.Millisecond):
	}
	close(release)
	if err := <-refreshed; err != nil {
		t.Fatal(err)
	}
	if code := <-loggedOut; code != 0 {
		t.Fatalf("exit %d", code)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatal("the refresh wrote tokens after logout")
	}
}

func TestLogoutRemovesOrphanedTempFiles(t *testing.T) {
	p := seed(t, 1)
	orphan := filepath.Join(filepath.Dir(p), ".spotify-123.json")
	if err := os.WriteFile(orphan, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if code := LogoutMain([]string{"--file", p}, io.Discard, io.Discard); code != 0 {
		t.Fatalf("exit %d", code)
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Fatal("an orphaned temp file survived logout")
	}
}

func TestLogoutWithoutADirectory(t *testing.T) {
	p := filepath.Join(t.TempDir(), "nope", "spotify.json")
	if code := LogoutMain([]string{"--file", p}, io.Discard, io.Discard); code != 0 {
		t.Fatalf("exit %d", code)
	}
}

func TestLogout(t *testing.T) {
	p := seed(t, 1)
	if code := LogoutMain([]string{"--file", p}, io.Discard, io.Discard); code != 0 {
		t.Fatalf("exit %d", code)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatal("the token file is still there")
	}
	if code := LogoutMain([]string{"--file", p}, io.Discard, io.Discard); code != 0 {
		t.Fatalf("second logout: exit %d", code)
	}
}

package spotify

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const AuthURL = "https://accounts.spotify.com/authorize"

// Scopes cover the player, its lists and liking (user-library-modify).
const Scopes = "user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played playlist-read-private playlist-read-collaborative user-library-read user-library-modify"

var clientIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

func randomString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// challenge is PKCE's S256 code challenge for verifier (RFC 7636 section 4.2).
func challenge(verifier string) string {
	s := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(s[:])
}

// AuthorizeURL is the page the person agrees on; Spotify then redirects to redirect with a code.
func AuthorizeURL(clientID, redirect, codeChallenge, state string) string {
	q := url.Values{
		"client_id":             {clientID},
		"response_type":         {"code"},
		"redirect_uri":          {redirect},
		"code_challenge_method": {"S256"},
		"code_challenge":        {codeChallenge},
		"state":                 {state},
		"scope":                 {Scopes},
	}
	return AuthURL + "?" + q.Encode()
}

// Login waits for Spotify's redirect, on the loopback listener or as an address written to
// PasteFile (for a browser that cannot reach this machine's 127.0.0.1), and exchanges its code.
type Login struct {
	Auth      Auth
	ClientID  string
	Out       string
	PasteFile string
	Listener  net.Listener
	Open      func(string) error
	// Notice gets the authorize URL as its first line, then one line per rejected paste.
	Notice io.Writer
	Poll   time.Duration
}

type callback struct {
	q    url.Values
	done chan error
}

const pageDone = "<!doctype html><title>glowup</title><p>Connected. You can close this tab.</p>"

func (l Login) Run(ctx context.Context) error {
	redirect := fmt.Sprintf("http://127.0.0.1:%d/callback", l.Listener.Addr().(*net.TCPAddr).Port)
	verifier, state := randomString(64), randomString(16)
	auth := AuthorizeURL(l.ClientID, redirect, challenge(verifier), state)
	fmt.Fprintln(l.Notice, auth)
	// the URL is already printed, so a browser that will not open is not an error
	_ = l.Open(auth)

	got := make(chan callback)
	srv := &http.Server{ReadHeaderTimeout: 10 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" {
			http.NotFound(w, r)
			return
		}
		q := r.URL.Query()
		if q.Get("state") != state {
			http.Error(w, "This address is not from glowup's current login. Start it again from Claude Code.", http.StatusBadRequest)
			return
		}
		cb := callback{q: q, done: make(chan error, 1)}
		select {
		case got <- cb:
		case <-r.Context().Done():
			return
		case <-ctx.Done():
			http.Error(w, "glowup stopped waiting for this login.", http.StatusGone)
			return
		}
		if err := <-cb.done; err != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, "<!doctype html><title>glowup</title><p>glowup could not connect: %s</p>", html.EscapeString(err.Error()))
			return
		}
		_, _ = io.WriteString(w, pageDone)
	})}
	go func() { _ = srv.Serve(l.Listener) }()
	defer func() {
		sctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()

	if l.PasteFile != "" {
		go l.watchPaste(ctx, state, got)
	}
	for {
		select {
		case <-ctx.Done():
			return errors.New("timed out waiting for the browser")
		case cb := <-got:
			err := l.finish(ctx, cb.q, redirect, verifier)
			cb.done <- err
			return err
		}
	}
}

// watchPaste hands on an address written to PasteFile, and says why when it is not this login's.
func (l Login) watchPaste(ctx context.Context, state string, got chan<- callback) {
	t := time.NewTicker(l.Poll)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		b, err := os.ReadFile(l.PasteFile)
		if err != nil {
			continue
		}
		_ = os.Remove(l.PasteFile)
		u, err := url.Parse(strings.TrimSpace(string(b)))
		if err != nil || u.Query().Get("state") != state {
			fmt.Fprintln(l.Notice, "That address is not from this login. Paste the address the browser shows after you agree.")
			continue
		}
		select {
		case got <- callback{q: u.Query(), done: make(chan error, 1)}:
		case <-ctx.Done():
		}
		return
	}
}

func (l Login) finish(ctx context.Context, q url.Values, redirect, verifier string) error {
	if e := q.Get("error"); e != "" {
		return fmt.Errorf("Spotify said: %s", e)
	}
	code := q.Get("code")
	if code == "" {
		return errors.New("the redirect carried no code")
	}
	tr, err := l.Auth.post(ctx, url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirect},
		"client_id":     {l.ClientID},
		"code_verifier": {verifier},
	})
	if err != nil {
		return err
	}
	now := l.Auth.Now()
	return WriteTokens(l.Out, Tokens{
		Format: TokensFormat, ClientID: l.ClientID, AccessToken: tr.AccessToken, RefreshToken: tr.RefreshToken,
		ExpiresAt: now.Add(time.Duration(tr.ExpiresIn) * time.Second).UnixMilli(), Scope: tr.Scope, ConnectedAt: now.UnixMilli(), Gen: 1,
	})
}

// openBrowser leaves the child's output unconnected: stdout is the mod's channel.
func openBrowser(u string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", u)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	default:
		cmd = exec.Command("xdg-open", u)
	}
	return cmd.Start()
}

// LoginMain runs `glowup-installer spotify-login --client-id ID --out FILE [--paste-file FILE] [--timeout D]`.
func LoginMain(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("glowup-installer spotify-login", flag.ContinueOnError)
	fs.SetOutput(stderr)
	id := fs.String("client-id", "", "the Client ID of your Spotify app")
	out := fs.String("out", "", "the token file to write")
	paste := fs.String("paste-file", "", "a file glowup writes a pasted redirect address to")
	wait := fs.Duration("timeout", 5*time.Minute, "how long to wait for the browser")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if !clientIDPattern.MatchString(*id) || *out == "" || fs.NArg() != 0 {
		fmt.Fprintln(stderr, "usage: glowup-installer spotify-login --client-id ID --out FILE [--paste-file FILE] (ID is 32 hex characters)")
		return 2
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(stderr, "glowup-installer spotify-login:", err)
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), *wait)
	defer cancel()
	err = Login{
		Auth:     Auth{Client: &http.Client{}, TokenURL: TokenURL, Now: time.Now},
		ClientID: *id, Out: *out, PasteFile: *paste, Listener: ln,
		Open: openBrowser, Notice: stdout, Poll: 500 * time.Millisecond,
	}.Run(ctx)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}

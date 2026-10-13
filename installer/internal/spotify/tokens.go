package spotify

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	TokenURL = "https://accounts.spotify.com/api/token"
	// The token file format this build reads and writes; the mod refuses a newer one too.
	TokensFormat = 1
)

// Tokens is <configDir>/glowup/spotify.json. Gen counts refreshes, so a refresh that lost a
// race to another session can tell from the file alone, without comparing secrets.
type Tokens struct {
	Format       int    `json:"format"`
	ClientID     string `json:"clientId"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresAt    int64  `json:"expiresAt"`
	Scope        string `json:"scope"`
	ConnectedAt  int64  `json:"connectedAt"`
	Gen          int    `json:"gen"`
}

// ReadTokens reads the token file and refuses one a newer glowup wrote.
func ReadTokens(path string) (Tokens, error) {
	var t Tokens
	b, err := os.ReadFile(path)
	if err != nil {
		return t, err
	}
	if err := json.Unmarshal(b, &t); err != nil {
		return t, fmt.Errorf("%s does not parse: %w", path, err)
	}
	if t.Format > TokensFormat {
		return t, fmt.Errorf("%s was saved by a newer glowup", path)
	}
	return t, nil
}

// WriteTokens replaces the file through a temporary file and a rename, so a reader never sees half of it.
// CreateTemp makes the file 0600. MkdirAll makes a missing directory 0700 and leaves an existing one
// (<configDir>/glowup, which A1 already writes to) as it is.
func WriteTokens(path string, t Tokens) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	b, err := json.Marshal(t)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".spotify-*.json")
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		os.Remove(f.Name())
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(f.Name())
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return err
	}
	if err := os.Rename(f.Name(), path); err != nil {
		os.Remove(f.Name())
		return err
	}
	return nil
}

// Auth talks to Spotify's token endpoint; TokenURL and Now are fields so tests can stand in.
type Auth struct {
	Client   *http.Client
	TokenURL string
	Now      func() time.Time
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	Scope        string `json:"scope"`
	Error        string `json:"error"`
	Description  string `json:"error_description"`
}

// GrantError is the token endpoint's refusal; Code is OAuth's error code, such as invalid_grant.
type GrantError struct {
	Status            int
	Code, Description string
}

func (e *GrantError) Error() string {
	if e.Description != "" {
		return "Spotify refused: " + e.Description
	}
	if e.Code != "" {
		return "Spotify refused: " + e.Code
	}
	return fmt.Sprintf("Spotify's token endpoint answered %d", e.Status)
}

func (a Auth) post(ctx context.Context, form url.Values) (tokenResponse, error) {
	var tr tokenResponse
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return tr, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := a.Client.Do(req)
	if err != nil {
		return tr, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return tr, err
	}
	_ = json.Unmarshal(body, &tr)
	if resp.StatusCode != http.StatusOK || tr.Error != "" {
		return tr, &GrantError{Status: resp.StatusCode, Code: tr.Error, Description: tr.Description}
	}
	if tr.AccessToken == "" {
		return tr, errors.New("Spotify's token endpoint sent no access token")
	}
	return tr, nil
}

// ErrInvalidGrant is Spotify refusing the refresh token: the person must connect again.
var ErrInvalidGrant = errors.New("Spotify refused the saved login; connect again")

const (
	// Longer than post's 10s timeout, so a waiter behind a slow refresh sees its token land.
	lockWait = 15 * time.Second
	// A refresh takes seconds; a lock this old was left by a killed run.
	lockStale = 30 * time.Second
)

// lockFile is a portable exclusive lock: the standard library has no LockFileEx, and O_EXCL works everywhere.
func lockFile(path string) (func(), error) {
	lock := path + ".lock"
	deadline := time.Now().Add(lockWait)
	for {
		f, err := os.OpenFile(lock, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			st, _ := f.Stat()
			f.Close()
			return func() {
				// a run that took this lock as stale may own the path now
				if cur, e := os.Stat(lock); e == nil && st != nil && os.SameFile(st, cur) {
					os.Remove(lock)
				}
			}, nil
		}
		if !errors.Is(err, fs.ErrExist) {
			return nil, err
		}
		if st, e := os.Stat(lock); e == nil && time.Since(st.ModTime()) > lockStale {
			os.Remove(lock)
			continue
		}
		if time.Now().After(deadline) {
			return nil, errors.New("another refresh is still running")
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// Refresh swaps the refresh token for a new access token, unless the file has moved past gen,
// which means another run refreshed it while the caller waited.
func Refresh(ctx context.Context, a Auth, path string, gen int) error {
	unlock, err := lockFile(path)
	if err != nil {
		return err
	}
	defer unlock()
	t, err := ReadTokens(path)
	if err != nil {
		return err
	}
	if t.Gen != gen {
		return nil
	}
	tr, err := a.post(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {t.RefreshToken}, "client_id": {t.ClientID}})
	var ge *GrantError
	if errors.As(err, &ge) && ge.Code == "invalid_grant" {
		return ErrInvalidGrant
	}
	if err != nil {
		return err
	}
	t.AccessToken = tr.AccessToken
	// Spotify may or may not rotate it
	if tr.RefreshToken != "" {
		t.RefreshToken = tr.RefreshToken
	}
	if tr.Scope != "" {
		t.Scope = tr.Scope
	}
	t.ExpiresAt = a.Now().Add(time.Duration(tr.ExpiresIn) * time.Second).UnixMilli()
	t.Gen++
	return WriteTokens(path, t)
}

// RefreshMain runs `glowup-installer spotify-refresh --file FILE --if-gen N`.
func RefreshMain(args []string, stdout, stderr io.Writer) int {
	fl := flag.NewFlagSet("glowup-installer spotify-refresh", flag.ContinueOnError)
	fl.SetOutput(stderr)
	file := fl.String("file", "", "the token file")
	gen := fl.Int("if-gen", -1, "refresh only while the file holds this generation")
	if err := fl.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if *file == "" || *gen < 0 || fl.NArg() != 0 {
		fmt.Fprintln(stderr, "usage: glowup-installer spotify-refresh --file FILE --if-gen N")
		return 2
	}
	err := Refresh(context.Background(), Auth{Client: &http.Client{}, TokenURL: TokenURL, Now: time.Now}, *file, *gen)
	if errors.Is(err, ErrInvalidGrant) {
		fmt.Fprintln(stderr, err)
		return 3
	}
	if err != nil {
		fmt.Fprintln(stderr, "glowup-installer spotify-refresh:", err)
		return 1
	}
	return 0
}

// LogoutMain runs `glowup-installer spotify-logout --file FILE`: the helper stays the only writer of the secret file.
func LogoutMain(args []string, stdout, stderr io.Writer) int {
	fl := flag.NewFlagSet("glowup-installer spotify-logout", flag.ContinueOnError)
	fl.SetOutput(stderr)
	file := fl.String("file", "", "the token file")
	if err := fl.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if *file == "" || fl.NArg() != 0 {
		fmt.Fprintln(stderr, "usage: glowup-installer spotify-logout --file FILE")
		return 2
	}
	// The lock keeps a refresh that is mid-request from writing tokens back after the remove.
	unlock, err := lockFile(*file)
	if errors.Is(err, fs.ErrNotExist) {
		return 0
	}
	if err != nil {
		fmt.Fprintln(stderr, "glowup-installer spotify-logout:", err)
		return 1
	}
	defer unlock()
	if err := os.Remove(*file); err != nil && !errors.Is(err, fs.ErrNotExist) {
		fmt.Fprintln(stderr, "glowup-installer spotify-logout:", err)
		return 1
	}
	// a write killed between CreateTemp and Rename leaves its tokens in a temp file
	orphans, _ := filepath.Glob(filepath.Join(filepath.Dir(*file), ".spotify-*.json"))
	for _, o := range orphans {
		os.Remove(o)
	}
	return 0
}

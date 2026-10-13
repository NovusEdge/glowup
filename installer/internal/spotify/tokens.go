package spotify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

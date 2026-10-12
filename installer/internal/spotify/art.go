// Package spotify holds glowup's Spotify helpers, run by the mod as glowup-installer subcommands.
package spotify

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"time"
)

const (
	maxBody = 2 << 20
	// Checked with DecodeConfig before the decode allocates, so a small file cannot claim a huge canvas.
	maxSide = 2048
	maxSize = 64
)

// Allowed reports whether u is an image on Spotify's CDN.
func Allowed(u *url.URL) bool {
	h := u.Hostname()
	return u.Scheme == "https" && (h == "i.scdn.co" || h == "mosaic.scdn.co")
}

// Art is what spotify-art prints: Size×Size RGB, three bytes a pixel, row by row.
type Art struct {
	W   int    `json:"w"`
	H   int    `json:"h"`
	RGB string `json:"rgb"`
}

// Fetcher's Allowed is a field so a test can admit its own server.
type Fetcher struct {
	Client  *http.Client
	Allowed func(*url.URL) bool
}

// Fetch downloads a cover, checks its size and shrinks it to size pixels square; Client and Allowed must both be set.
func (f Fetcher) Fetch(ctx context.Context, raw string, size int) (Art, error) {
	u, err := url.Parse(raw)
	if err != nil || !f.Allowed(u) {
		return Art{}, fmt.Errorf("not a Spotify image URL: %s", raw)
	}
	c := *f.Client
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 || !f.Allowed(req.URL) {
			return errors.New("redirect leaves the Spotify image hosts")
		}
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return Art{}, err
	}
	resp, err := c.Do(req)
	if err != nil {
		return Art{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Art{}, fmt.Errorf("image request: %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	if err != nil {
		return Art{}, err
	}
	if len(body) > maxBody {
		return Art{}, errors.New("image is over 2 MiB")
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return Art{}, err
	}
	if cfg.Width < 1 || cfg.Height < 1 || cfg.Width > maxSide || cfg.Height > maxSide {
		return Art{}, fmt.Errorf("image is %dx%d, over %d a side", cfg.Width, cfg.Height, maxSide)
	}
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return Art{}, err
	}
	return Art{W: size, H: size, RGB: base64.RawURLEncoding.EncodeToString(Shrink(img, size))}, nil
}

// Shrink box-averages img into size×size RGB.
func Shrink(img image.Image, size int) []byte {
	b := img.Bounds()
	out := make([]byte, 0, size*size*3)
	for oy := 0; oy < size; oy++ {
		y0, y1 := b.Min.Y+oy*b.Dy()/size, b.Min.Y+(oy+1)*b.Dy()/size
		y1 = max(y1, y0+1)
		for ox := 0; ox < size; ox++ {
			x0, x1 := b.Min.X+ox*b.Dx()/size, b.Min.X+(ox+1)*b.Dx()/size
			x1 = max(x1, x0+1)
			var r, g, bl, n uint64
			for y := y0; y < y1; y++ {
				for x := x0; x < x1; x++ {
					cr, cg, cb, _ := img.At(x, y).RGBA()
					r, g, bl, n = r+uint64(cr>>8), g+uint64(cg>>8), bl+uint64(cb>>8), n+1
				}
			}
			out = append(out, byte(r/n), byte(g/n), byte(bl/n))
		}
	}
	return out
}

// ArtMain runs `glowup-installer spotify-art --size N URL`; the mod passes the 64 px cover URL.
func ArtMain(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("glowup-installer spotify-art", flag.ContinueOnError)
	fs.SetOutput(stderr)
	size := fs.Int("size", 8, "the side of the square to shrink to, 1 to 64 pixels")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if fs.NArg() != 1 || *size < 1 || *size > maxSize {
		fmt.Fprintln(stderr, "usage: glowup-installer spotify-art --size N URL (N from 1 to 64)")
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	art, err := Fetcher{Client: &http.Client{}, Allowed: Allowed}.Fetch(ctx, fs.Arg(0), *size)
	if err != nil {
		fmt.Fprintln(stderr, "glowup-installer spotify-art:", err)
		return 1
	}
	if err := json.NewEncoder(stdout).Encode(art); err != nil {
		return 1
	}
	return 0
}

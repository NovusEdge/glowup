package spotify

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// twoTone is red on the left half, blue on the right.
func twoTone(w, h int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := color.RGBA{255, 0, 0, 255}
			if x >= w/2 {
				c = color.RGBA{0, 0, 255, 255}
			}
			img.Set(x, y, c)
		}
	}
	return img
}

func encodePNG(t *testing.T, img image.Image) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// serve answers /img with body, /back with a same-host redirect and /away with one to another host.
func serve(t *testing.T, body []byte) (*httptest.Server, Fetcher) {
	t.Helper()
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/img":
			w.Write(body)
		case "/back":
			http.Redirect(w, r, "/img", http.StatusFound)
		case "/away":
			http.Redirect(w, r, "https://example.com/img", http.StatusFound)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	host := strings.TrimPrefix(ts.URL, "https://")
	return ts, Fetcher{Client: ts.Client(), Allowed: func(u *url.URL) bool { return u.Scheme == "https" && u.Host == host }}
}

func TestShrinkAveragesBoxes(t *testing.T) {
	got := Shrink(twoTone(64, 64), 2)
	want := []byte{255, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 255}
	if !bytes.Equal(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestFetchShrinksPNGAndDecodesJPEG(t *testing.T) {
	ts, f := serve(t, encodePNG(t, twoTone(64, 64)))
	art, err := f.Fetch(context.Background(), ts.URL+"/back", 8)
	if err != nil {
		t.Fatal(err)
	}
	rgb, err := base64.RawURLEncoding.DecodeString(art.RGB)
	if err != nil || art.W != 8 || art.H != 8 || len(rgb) != 8*8*3 {
		t.Fatalf("got %dx%d, %d bytes, %v", art.W, art.H, len(rgb), err)
	}
	if rgb[0] != 255 || rgb[2] != 0 || rgb[7*3+2] != 255 {
		t.Fatalf("first row %v", rgb[:24])
	}
	var j bytes.Buffer
	if err := jpeg.Encode(&j, twoTone(64, 64), &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	ts2, f2 := serve(t, j.Bytes())
	if _, err := f2.Fetch(context.Background(), ts2.URL+"/img", 8); err != nil {
		t.Fatal(err)
	}
}

func TestFetchRefuses(t *testing.T) {
	ts, f := serve(t, make([]byte, maxBody+1))
	cases := map[string]string{
		ts.URL + "/away": "redirect leaves",
		ts.URL + "/img":  "over 2 MiB",
	}
	for u, want := range cases {
		if _, err := f.Fetch(context.Background(), u, 8); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: got %v, want %q", u, err, want)
		}
	}
	big, fb := serve(t, encodePNG(t, image.NewGray(image.Rect(0, 0, 4096, 1))))
	if _, err := fb.Fetch(context.Background(), big.URL+"/img", 8); err == nil || !strings.Contains(err.Error(), "4096x1") {
		t.Errorf("4096 wide: got %v", err)
	}
	real := Fetcher{Client: http.DefaultClient, Allowed: Allowed}
	if _, err := real.Fetch(context.Background(), "https://example.com/x.jpg", 8); err == nil || !strings.Contains(err.Error(), "not a Spotify image URL") {
		t.Errorf("other host: got %v", err)
	}
}

func TestAllowed(t *testing.T) {
	for raw, want := range map[string]bool{
		"https://i.scdn.co/image/ab67616d00004851ff":    true,
		"https://mosaic.scdn.co/640/ab67616d0000b273aa": true,
		"http://i.scdn.co/image/ab67616d00004851ff":     false,
		"https://i.scdn.co.evil.test/image/x":           false,
		"https://open.spotify.com/image/ab67616d":       false,
	} {
		u, _ := url.Parse(raw)
		if got := Allowed(u); got != want {
			t.Errorf("%s: got %v", raw, got)
		}
	}
}

func TestArtMainUsage(t *testing.T) {
	for _, args := range [][]string{{}, {"--size", "0", "https://i.scdn.co/image/x"}, {"--size", "65", "https://i.scdn.co/image/x"}, {"a", "b"}} {
		var out, errb bytes.Buffer
		if code := ArtMain(args, &out, &errb); code != 2 {
			t.Errorf("%v: exit %d", args, code)
		}
	}
	var out, errb bytes.Buffer
	if code := ArtMain([]string{"https://example.com/x.jpg"}, &out, &errb); code != 1 || !strings.Contains(errb.String(), "not a Spotify image URL") {
		t.Errorf("other host: exit %d, %q", code, errb.String())
	}
}

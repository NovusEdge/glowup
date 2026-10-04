package tui

import (
	"bytes"
	"io"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/colorprofile"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

// styled is a stretch of text drawn with one foreground and background. An empty
// color is the terminal's own default.
type styled struct{ text, fg, bg string }

var sgr = regexp.MustCompile("\x1b\\[([0-9;]*)m")

// styledRuns splits s, which holds only SGR sequences, into runs of text with the
// colors in force where they are drawn.
func styledRuns(s string) []styled {
	var out []styled
	var fg, bg string
	pos := 0
	emit := func(to int) {
		if to > pos {
			out = append(out, styled{s[pos:to], fg, bg})
		}
	}
	for _, m := range sgr.FindAllStringSubmatchIndex(s, -1) {
		emit(m[0])
		pos = m[1]
		params := strings.Split(s[m[2]:m[3]], ";")
		for i := 0; i < len(params); i++ {
			n, _ := strconv.Atoi(params[i])
			switch {
			case n == 0:
				fg, bg = "", ""
			case n == 39:
				fg = ""
			case n == 49:
				bg = ""
			case n >= 30 && n <= 37, n >= 90 && n <= 97:
				fg = params[i]
			case n >= 40 && n <= 47, n >= 100 && n <= 107:
				bg = strconv.Itoa(n - 10) // the foreground code for the same color
			case n == 38 || n == 48:
				take := 2 // 38;5;n
				if i+1 < len(params) && params[i+1] == "2" {
					take = 4 // 38;2;r;g;b
				}
				end := min(len(params), i+1+take)
				c := strings.Join(params[i+1:end], ";")
				if n == 38 {
					fg = c
				} else {
					bg = c
				}
				i = end - 1
			}
		}
	}
	emit(len(s))
	return out
}

func downsample(s string, p colorprofile.Profile) string {
	var b bytes.Buffer
	w := &colorprofile.Writer{Forward: &b, Profile: p}
	_, _ = w.WriteString(s)
	return b.String()
}

// An unselected item without a color of its own takes the terminal's, so it shows on a
// light terminal (xterm's default is black on white) as well as a dark one. huh's own
// theme draws it in a fixed light gray, which ANSI turns into bright white.
func TestPackListStaysVisibleUnderEveryProfile(t *testing.T) {
	m := start(NewModel(claude.Choice{Pack: "arcade", Pet: "clawd", Bubbles: "on"}, false))
	view := m.form.View()
	profiles := map[string]colorprofile.Profile{"ANSI": colorprofile.ANSI, "ANSI256": colorprofile.ANSI256, "TrueColor": colorprofile.TrueColor}
	for name, p := range profiles {
		t.Run(name, func(t *testing.T) {
			runs := styledRuns(downsample(view, p))
			for _, item := range packs.Names() {
				var found []styled
				for _, r := range runs {
					if strings.Contains(r.text, item) {
						found = append(found, r)
					}
				}
				if len(found) == 0 {
					t.Fatalf("%q is not on the list:\n%s", item, ansi.Strip(view))
				}
				for _, r := range found {
					if r.fg != "" && r.fg == r.bg {
						t.Errorf("%q is drawn in %s on the same %s", item, r.fg, r.bg)
					}
					if item != "arcade" && r.fg != "" {
						t.Errorf("unselected %q has the fixed color %s, which can match a terminal background", item, r.fg)
					}
				}
			}
		})
	}
}

func TestColorProfile(t *testing.T) {
	base := []string{"TTY_FORCE=1"}
	for _, tc := range []struct {
		name string
		env  []string
		want colorprofile.Profile
	}{
		{"xterm", []string{"TERM=xterm"}, colorprofile.ANSI256},
		{"xterm-256color", []string{"TERM=xterm-256color"}, colorprofile.ANSI256},
		{"xterm that says it has 24-bit", []string{"TERM=xterm", "XTERM_VERSION=XTerm(397)"}, colorprofile.TrueColor},
		{"xterm too old for 24-bit", []string{"TERM=xterm", "XTERM_VERSION=XTerm(300)"}, colorprofile.ANSI256},
		{"xterm with garbage version", []string{"TERM=xterm", "XTERM_VERSION=nope"}, colorprofile.ANSI256},
		{"xterm with COLORTERM", []string{"TERM=xterm", "COLORTERM=truecolor"}, colorprofile.TrueColor},
		{"XTERM_VERSION without xterm TERM", []string{"TERM=linux", "XTERM_VERSION=XTerm(397)"}, colorprofile.ANSI},
		{"NO_COLOR", []string{"TERM=xterm", "NO_COLOR=1", "XTERM_VERSION=XTerm(397)"}, colorprofile.ASCII},
		{"dumb", []string{"TERM=dumb"}, colorprofile.NoTTY},
		{"alacritty", []string{"TERM=alacritty"}, colorprofile.TrueColor},
		{"kitty", []string{"TERM=xterm-kitty"}, colorprofile.TrueColor},
		{"screen", []string{"TERM=screen"}, colorprofile.ANSI256},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ColorProfile(io.Discard, append(base, tc.env...)); got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

// never answers: a terminal that ignores every query the program sends.
type never struct{ done chan struct{} }

func (n never) Read([]byte) (int, error) { <-n.done; return 0, io.EOF }

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

func TestPickerDrawsWithoutAnyReplyFromTheTerminal(t *testing.T) {
	for _, term := range []string{"alacritty", "xterm", "xterm-kitty"} {
		t.Run(term, func(t *testing.T) {
			in := never{make(chan struct{})}
			defer close(in.done)
			out := &syncBuf{}
			p := tea.NewProgram(NewModel(claude.Defaults(), false),
				tea.WithInput(in), tea.WithOutput(out), tea.WithWindowSize(120, 40),
				tea.WithEnvironment([]string{"TERM=" + term, "COLORTERM=truecolor"}))
			go p.Run()
			defer p.Kill()
			deadline := time.Now().Add(3 * time.Second)
			for !strings.Contains(out.String(), "Pick a pack") {
				if time.Now().After(deadline) {
					t.Fatalf("nothing drawn in 3s; wrote %q", out.String())
				}
				time.Sleep(20 * time.Millisecond)
			}
		})
	}
}

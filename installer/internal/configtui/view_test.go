package configtui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func viewAt(m Model, w, h int) []string {
	m.width, m.height = w, h
	return strings.Split(ansi.Strip(m.View().Content), "\n")
}

func TestEverySectionFitsTheTerminal(t *testing.T) {
	for _, size := range [][2]int{{80, 24}, {99, 30}, {100, 29}, {120, 40}, {60, 20}} {
		m, _ := newModel(t)
		for sec := range sections {
			m.section, m.at = sec, rowsOf(sec, m.snap)[0].id
			ls := viewAt(m, size[0], size[1])
			if len(ls) > size[1] {
				t.Fatalf("%v section %d: %d lines", size, sec, len(ls))
			}
			for _, l := range ls {
				if w := ansi.StringWidth(l); w > size[0] {
					t.Fatalf("%v section %d: line %d wide: %q", size, sec, w, l)
				}
			}
		}
	}
}

func TestNoSizeOverflowsTheTerminal(t *testing.T) {
	m, _ := newModel(t)
	for _, w := range []int{20, 37, 38, 39, 60, 99, 100, 101, 123, 124, 125, 160} {
		for _, h := range []int{5, 6, 12, 24, 29, 30, 31, 50} {
			for sec := range sections {
				m.section, m.at = sec, rowsOf(sec, m.snap)[len(rowsOf(sec, m.snap))-1].id
				ls := viewAt(m, w, h)
				if len(ls) > h {
					t.Fatalf("%dx%d section %d: %d lines", w, h, sec, len(ls))
				}
				for _, l := range ls {
					if ansi.StringWidth(l) > w {
						t.Fatalf("%dx%d section %d: line %d wide: %q", w, h, sec, ansi.StringWidth(l), l)
					}
				}
			}
		}
	}
}

func TestWideLayoutShowsThePreviewAndSections(t *testing.T) {
	m, _ := newModel(t)
	out := strings.Join(viewAt(m, 120, 40), "\n")
	for _, want := range []string{"▸ Look", "Colors", "Pack", "‹ classic ›", "esc undo & quit"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in\n%s", want, out)
		}
	}
	if !strings.Contains(out, "╭") {
		t.Fatal("no preview box")
	}
}

func TestNarrowLayoutHasATabLineAndNoPreviewBox(t *testing.T) {
	m, _ := newModel(t)
	ls := viewAt(m, 80, 24)
	if !strings.Contains(ls[1], "Look") || !strings.Contains(ls[1], "Status") {
		t.Fatalf("no tab line: %q", ls[1])
	}
	if strings.Contains(strings.Join(ls, "\n"), "╭") {
		t.Fatal("the preview box does not fit at 80x24")
	}
}

func TestTheCursorRowStaysOnScreen(t *testing.T) {
	m, _ := newModel(t)
	m.section, m.at = 1, "color:sel"
	out := strings.Join(viewAt(m, 80, 12), "\n")
	if !strings.Contains(out, "› ") || !strings.Contains(out, "sel") {
		t.Fatalf("cursor row scrolled away:\n%s", out)
	}
}

func TestEditingShowsTheBuffer(t *testing.T) {
	m, _ := newModel(t)
	m.section, m.at, m.editing, m.buf = 1, "color:accent", true, "12"
	if !strings.Contains(strings.Join(viewAt(m, 120, 40), "\n"), "#12▏") {
		t.Fatal("no hex input")
	}
}

func TestStatusLineShowsInTheFooter(t *testing.T) {
	m, _ := newModel(t)
	m.flash = "Keep at least one."
	ls := viewAt(m, 80, 24)
	if !strings.Contains(strings.Join(ls, "\n"), "Keep at least one.") {
		t.Fatal("no status line")
	}
}

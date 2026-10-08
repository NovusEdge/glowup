package configtui

import (
	"image/color"
	"strings"
	"testing"

	"github.com/charmbracelet/colorprofile"
	"github.com/charmbracelet/x/ansi"
)

func viewAt(m Model, w, h int) []string {
	m.width, m.height = w, h
	return strings.Split(ansi.Strip(m.View().Content), "\n")
}

func hasPreview(ls []string) bool {
	return strings.Contains(strings.Join(ls, "\n"), "add a dark mode toggle")
}

func TestEverySectionFitsTheTerminal(t *testing.T) {
	for _, size := range [][2]int{{80, 24}, {78, 23}, {104, 23}, {120, 36}, {60, 20}} {
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
	for _, w := range []int{20, 35, 36, 37, 60, 73, 74, 77, 78, 79, 103, 104, 105, 160} {
		for _, h := range []int{5, 12, 13, 14, 22, 23, 24, 36, 50} {
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

func TestTheBlockIsCenteredAndAsTallAsThePreviewPlusChrome(t *testing.T) {
	m, _ := newModel(t)
	ls := viewAt(m, 120, 36)
	if !strings.HasPrefix(ls[6], strings.Repeat(" ", 8)+"glowup / config") {
		t.Fatalf("header is not 8 columns in and 6 rows down: %q", ls[6])
	}
	if got := ansi.StringWidth(strings.TrimRight(ls[8], " ")); got != 8+withPreview {
		t.Fatalf("pane row ends at column %d", got)
	}
	if previewH != 19 {
		t.Fatalf("previewH = %d", previewH)
	}
}

func TestWideLayoutShowsThePreviewAndSections(t *testing.T) {
	m, _ := newModel(t)
	out := strings.Join(viewAt(m, 120, 40), "\n")
	for _, want := range []string{"Look  Colors  Pane  Pet  Status", "Pack", "‹ classic ›", "esc undo & quit", "add a dark mode toggle", "glowup / config"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in\n%s", want, out)
		}
	}
}

func TestThePreviewNeedsAtLeast78x23(t *testing.T) {
	m, _ := newModel(t)
	for _, c := range []struct {
		w, h int
		want bool
	}{{78, 23, true}, {77, 23, false}, {78, 22, false}} {
		if got := hasPreview(viewAt(m, c.w, c.h)); got != c.want {
			t.Fatalf("%dx%d: preview drawn = %v", c.w, c.h, got)
		}
	}
}

func TestClawdColumnAppearsFrom104Columns(t *testing.T) {
	m, _ := newModel(t)
	for w, want := range map[int]bool{103: false, 104: true} {
		if got := strings.Contains(strings.Join(viewAt(m, w, 40), "\n"), "pet clawd"); got != want {
			t.Fatalf("width %d: Clawd column drawn = %v", w, got)
		}
	}
}

func TestThePreviewTitleCarriesABuiltInPacksDescription(t *testing.T) {
	m, _ := newModel(t)
	m.snap.Look = LookInfo{Name: "crt", Border: "bold"}
	if out := strings.Join(viewAt(m, 120, 40), "\n"); !strings.Contains(out, "crt green phosphor") {
		t.Fatalf("no description beside the pack name:\n%s", out)
	}
	m.snap.Look = LookInfo{Name: "mine"}
	if out := strings.Join(viewAt(m, 120, 40), "\n"); strings.Contains(out, "mine ") && strings.Contains(out, "green phosphor") {
		t.Fatalf("a user pack borrowed a description:\n%s", out)
	}
}

// A multi-row spinner (orb-states) once seemed to push the right border one column out.
// The view measures every cell, so the border stays in its column on every frame.
func TestPreviewBorderStaysInOneColumnOnEverySpinnerFrame(t *testing.T) {
	m, _ := newModel(t)
	m.snap.Look = LookInfo{Name: "crt", Bg: "#0a1a0f", Border: "bold", BorderColor: "#1f9944", Spinner: "orb-states", SpinColor: "#39ff6a", Word: "Thinking"}
	left := (200-withClawd)/2 + paneW + gap
	for ticks := range 40 {
		m.ticks = ticks
		var edge []string
		for _, l := range viewAt(m, 200, 50) {
			if box := ansi.Cut(l, left, left+previewW); strings.ContainsAny(box, "┃┏┗") {
				edge = append(edge, box)
			}
		}
		if len(edge) < 10 {
			t.Fatalf("tick %d: found %d preview rows", ticks, len(edge))
		}
		for _, box := range edge {
			if r := []rune(box); !strings.ContainsRune("┃┏┗", r[0]) || !strings.ContainsRune("┃┓┛", r[len(r)-1]) || ansi.StringWidth(box) != previewW {
				t.Fatalf("tick %d: preview row is not boxed in its column: %q", ticks, box)
			}
		}
	}
}

func TestThePaneFollowsTheLooksBorder(t *testing.T) {
	m, _ := newModel(t)
	m.snap.Look = LookInfo{Name: "crt", Bg: "#0a1a0f", Border: "bold", BorderColor: "#1f9944"}
	out := m.View().Content
	if !strings.Contains(ansi.Strip(out), "┏━") || !strings.Contains(out, "38;2;31;153;68") {
		t.Fatal("the pane is not drawn in crt's border")
	}
}

func TestNarrowLayoutIsThePaneAlone(t *testing.T) {
	m, _ := newModel(t)
	ls := viewAt(m, 60, 24)
	if !strings.Contains(strings.Join(ls, "\n"), "Look  Colors  Pane  Pet  Status") || hasPreview(ls) {
		t.Fatal("60x24 should show the pane without the preview")
	}
}

func TestTheRuleRunsUnderTheActiveTab(t *testing.T) {
	m, _ := newModel(t)
	for sec, name := range sections {
		m.section, m.at = sec, rowsOf(sec, m.snap)[0].id
		ls := viewAt(m, 80, 24)
		for i, l := range ls {
			if !strings.Contains(l, "Look  Colors") {
				continue
			}
			start := strings.Index(l, name)
			col := ansi.StringWidth(l[:start])
			under := ansi.Cut(ls[i+1], col, col+ansi.StringWidth(name))
			if under != strings.Repeat("━", ansi.StringWidth(name)) || strings.Count(ls[i+1], "━") != ansi.StringWidth(name) {
				t.Fatalf("%s: rule under the tab is %q in %q", name, under, ls[i+1])
			}
			break
		}
	}
}

func TestHelpFollowsTheFocusedRow(t *testing.T) {
	m, _ := newModel(t)
	tail := "tab section • q keep & quit • esc undo & quit"
	for _, c := range []struct {
		section int
		at, key string
	}{{0, "pack", "←→ change"}, {1, "color:accent", "enter edit • r reset"}, {2, "band:combo", "space toggle • J/K reorder"}} {
		m.section, m.at = c.section, c.at
		out := strings.Join(viewAt(m, 120, 36), "\n")
		if !strings.Contains(out, c.key+" • "+tail) {
			t.Fatalf("%s: help is not %q:\n%s", c.at, c.key+" • "+tail, out)
		}
	}
	m.section, m.at, m.editing = 1, "color:accent", true
	if out := strings.Join(viewAt(m, 120, 36), "\n"); !strings.Contains(out, "enter set • esc cancel") || strings.Contains(out, "q keep") {
		t.Fatalf("the hex input lists its own keys:\n%s", out)
	}
}

func TestEveryListedKeyIsOneTheModelMatches(t *testing.T) {
	for _, k := range []kind{noRow, cycle, hexRow, item} {
		for _, b := range helpKeys(k, false) {
			if len(b.Keys()) == 0 {
				t.Fatalf("kind %d lists %q with no key", k, b.Help().Key)
			}
		}
	}
}

func TestTheHelpWrapsAtNarrowWidthsAndKeepsBothQuitKeys(t *testing.T) {
	m, _ := newModel(t)
	for _, w := range []int{36, 50, 73} {
		out := strings.Join(viewAt(m, w, 24), "\n")
		for _, want := range []string{"q keep", "esc undo"} {
			if !strings.Contains(out, want) {
				t.Fatalf("%d wide: help lost %q:\n%s", w, want, out)
			}
		}
	}
}

func TestTheCursorRowStaysOnScreen(t *testing.T) {
	m, _ := newModel(t)
	m.section, m.at = 1, "color:sel"
	out := strings.Join(viewAt(m, 80, 14), "\n")
	if !strings.Contains(out, "❯ ") || !strings.Contains(out, "sel") {
		t.Fatalf("cursor row scrolled away:\n%s", out)
	}
}

func TestTheCursorRowCarriesTheSelBackground(t *testing.T) {
	m, _ := newModel(t)
	m.width, m.height = 120, 36
	for _, l := range strings.Split(m.View().Content, "\n") {
		if strings.Contains(ansi.Strip(l), "❯ Pack") {
			if !strings.Contains(l, "48;2;48;48;48") { // sel #303030
				t.Fatalf("no sel background on the cursor row: %q", l)
			}
			return
		}
	}
	t.Fatal("no cursor row")
}

func TestEditingShowsTheBuffer(t *testing.T) {
	m, _ := newModel(t)
	m.section, m.at, m.editing = 1, "color:accent", true
	m.input.SetValue("12")
	if !strings.Contains(strings.Join(viewAt(m, 120, 40), "\n"), "#12") {
		t.Fatal("no hex input")
	}
}

func TestTheSwatchShowsTheTypedColorOnceItIsSixDigits(t *testing.T) {
	m, _ := newModel(t)
	m.section, m.at, m.editing = 1, "color:accent", true
	m.input.SetValue("123456")
	if out := m.View().Content; !strings.Contains(out, "38;2;18;52;86") {
		t.Fatal("the swatch does not show #123456")
	}
}

func TestTerminalColorsFollowTheLook(t *testing.T) {
	m, _ := newModel(t)
	m.profile = colorprofile.TrueColor
	rgb := func(c color.Color) [3]uint32 {
		r, g, b, _ := c.RGBA()
		return [3]uint32{r >> 8, g >> 8, b >> 8}
	}
	v := m.View()
	if v.BackgroundColor == nil || rgb(v.BackgroundColor) != [3]uint32{0x1c, 0x1c, 0x1c} || rgb(v.ForegroundColor) != [3]uint32{0xe0, 0xe0, 0xe0} {
		t.Fatalf("colors = %v %v", v.BackgroundColor, v.ForegroundColor)
	}
	s := snap()
	s.State.Colors.Panel = "#102030"
	next, _ := m.Update(stateMsg(s))
	if got := rgb(next.(Model).View().BackgroundColor); got != [3]uint32{0x10, 0x20, 0x30} {
		t.Fatalf("background did not follow the new snapshot: %v", got)
	}
	m.profile = colorprofile.ASCII
	if v := m.View(); v.BackgroundColor != nil || v.ForegroundColor != nil {
		t.Fatal("colors set under ASCII")
	}
	if m.View().WindowTitle != "glowup config" || !m.View().AltScreen {
		t.Fatal("title or alt screen")
	}
}

func TestBelowTheFloorTheViewAsksForALargerWindow(t *testing.T) {
	m, _ := newModel(t)
	for _, size := range [][2]int{{35, 24}, {80, 12}} {
		if out := strings.Join(viewAt(m, size[0], size[1]), "\n"); !strings.Contains(out, "Make the window at least 36×13.") {
			t.Fatalf("%v: no floor message:\n%s", size, out)
		}
	}
	if out := strings.Join(viewAt(m, 36, 13), "\n"); strings.Contains(out, "Make the window") {
		t.Fatal("36x13 is large enough")
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

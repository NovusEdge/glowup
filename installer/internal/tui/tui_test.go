package tui

import (
	"cmp"
	"fmt"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

func previewOf(pack, theme, spinner string, c claude.Choice) string {
	return Preview(LookOf(pack, theme, spinner), c, 0)
}

func TestPreviewShowsPackAndChoice(t *testing.T) {
	p, _ := packs.ByName("crt")
	out := previewOf("crt", "", "", claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "off", ReducedMotion: true})
	plain := ansi.Strip(out)
	for _, want := range []string{"crt", "green phosphor", p.Spinner.Word + "…", "pet Clawd", "bubbles off", "motion reduced", "● Edit", "+12", "add a dark mode toggle"} {
		if !strings.Contains(plain, want) {
			t.Errorf("preview lacks %q:\n%s", want, plain)
		}
	}
	// #33ff66 is crt's text color: the preview is drawn in the pack's own colors.
	if !strings.Contains(out, "51;255;102") {
		t.Error("preview does not use crt's text color")
	}
}

func TestPreviewThemeAndSpinnerOverrideThePack(t *testing.T) {
	out := previewOf("crt", "dusk", "eyes", claude.Defaults())
	if !strings.Contains(out, "182;156;255") || strings.Contains(out, "51;255;102") {
		t.Error("a theme should replace the pack's colors")
	}
	l := LookOf("crt", "dusk", "eyes")
	d, _ := packs.ThemeByName("dusk")
	if l.Bg != d.Colors.Panel || l.Spinner.ID != "eyes" || l.Word != d.Word {
		t.Errorf("look = bg %s spinner %s word %s", l.Bg, l.Spinner.ID, l.Word)
	}
	own := LookOf("crt", "classic", "pack")
	if !own.OwnColors || !own.OwnSpinner || own.Spinner.ID != "comet" {
		t.Errorf("classic and pack should leave crt's own: %+v", own)
	}
}

func TestPreviewNoPet(t *testing.T) {
	if plain := ansi.Strip(previewOf("classic", "", "", claude.Choice{Pack: "classic", Pet: "off", Bubbles: "on"})); !strings.Contains(plain, "pet off") {
		t.Fatalf("pet off is not shown:\n%s", plain)
	}
}

// Every combination the picker can show, as pack, theme, spinner.
func looks() [][3]string {
	var all [][3]string
	for _, p := range packs.Names() {
		for _, th := range append([]string{""}, packs.ThemeNames()...) {
			for _, sp := range append([]string{""}, packs.SpinnerIDs()...) {
				all = append(all, [3]string{p, th, sp})
			}
		}
	}
	return all
}

// looksOneAtATime is each pack with each theme, then with each spinner: enough to
// reach every value without the cross product.
func looksOneAtATime() [][3]string {
	var all [][3]string
	for _, p := range packs.Names() {
		for _, th := range packs.ThemeNames() {
			all = append(all, [3]string{p, th, ""})
		}
		for _, sp := range packs.SpinnerIDs() {
			all = append(all, [3]string{p, "", sp})
		}
	}
	return all
}

func TestPreviewIsTheSameSizeForEveryLook(t *testing.T) {
	wantH := -1
	for _, k := range looks() {
		for tick := range 4 {
			lines := strings.Split(Preview(LookOf(k[0], k[1], k[2]), claude.Defaults(), tick), "\n")
			if wantH < 0 {
				wantH = len(lines)
			}
			if len(lines) != wantH {
				t.Fatalf("%v: %d lines, want %d", k, len(lines), wantH)
			}
			for _, line := range lines {
				if w := lipgloss.Width(line); w != PreviewWidth {
					t.Fatalf("%v: line is %d cells, want %d: %q", k, w, PreviewWidth, ansi.Strip(line))
				}
			}
		}
	}
}

// bareCells returns the cells of one rendered line that are drawn with no background
// color, by following the line's SGR sequences.
func bareCells(line string) []string {
	var bare []string
	bg := false
	for i := 0; i < len(line); {
		if line[i] == 0x1b && i+1 < len(line) && line[i+1] == '[' {
			j := i + 2
			for j < len(line) && (line[j] < 0x40 || line[j] > 0x7e) {
				j++
			}
			if j < len(line) && line[j] == 'm' {
				bg = sgrBackground(line[i+2:j], bg)
			}
			i = j + 1
			continue
		}
		r, n := utf8.DecodeRuneInString(line[i:])
		if !bg {
			bare = append(bare, string(r))
		}
		i += n
	}
	return bare
}

func sgrBackground(params string, bg bool) bool {
	p := strings.FieldsFunc(params, func(r rune) bool { return r == ';' || r == ':' })
	if len(p) == 0 {
		return false
	}
	for k := 0; k < len(p); k++ {
		switch p[k] {
		case "0", "49":
			bg = false
		case "48", "38":
			if p[k] == "48" {
				bg = true
			}
			if k+1 < len(p) && p[k+1] == "2" {
				k += 4
			} else {
				k += 2
			}
		default:
			var n int
			if _, err := fmt.Sscan(p[k], &n); err == nil && (n >= 40 && n <= 47 || n >= 100 && n <= 107) {
				bg = true
			}
		}
	}
	return bg
}

func TestBareCellsFindsTheGap(t *testing.T) {
	if got := bareCells("\x1b[38;2;1;2;3;48;2;9;9;9mab\x1b[m \x1b[48;2;1;1;1mc\x1b[0m"); !slices.Equal(got, []string{" "}) {
		t.Fatalf("got %q", got)
	}
}

// Whitespace inside the box (gaps between segments, padding, empty rows, the cells
// beside the spinner) used to show the terminal's background.
func TestPreviewEveryCellHasABackground(t *testing.T) {
	for _, k := range looks() {
		for _, pet := range []string{"clawd", "off"} {
			out := Preview(LookOf(k[0], k[1], k[2]), claude.Choice{Pet: pet, Bubbles: "on"}, 3)
			for n, line := range strings.Split(out, "\n") {
				if bare := bareCells(line); len(bare) > 0 {
					t.Fatalf("%v pet %s line %d has %d cells with no background (%q): %q", k, pet, n, len(bare), bare, ansi.Strip(line))
				}
			}
		}
	}
}

func TestPreviewFillsWithTheLooksBackground(t *testing.T) {
	l := LookOf("crt", "", "stock")
	lines := strings.Split(Preview(l, claude.Defaults(), 0), "\n")
	// #040a05 is crt's background, the preview's background; the padding row holds nothing but it.
	if row := lines[1]; !strings.Contains(row, "4;10;5") || strings.Contains(row, "48;2;0;0;0") {
		t.Fatalf("padding row is not the pack background: %q", row)
	}
}

func view(m Model) string { return ansi.Strip(m.View().Content) }

func resize(m Model, w, h int) Model { return send(m, tea.WindowSizeMsg{Width: w, Height: h}) }

func down(m Model) Model { return send(m, tea.KeyPressMsg{Code: tea.KeyDown}) }

func TestPickerPreviewFollowsCursor(t *testing.T) {
	m := resize(start(NewModel(claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on"}, false)), 120, 40)
	if v := view(m); !strings.Contains(v, "green phosphor") {
		t.Fatalf("starts off the flag's pack:\n%s", v)
	}
	m = down(m)
	if m.choice.Pack != "cozy" || !strings.Contains(view(m), "warm pastels") {
		t.Fatalf("after down: pack %q\n%s", m.choice.Pack, view(m))
	}
}

func TestPickerCtrlCDoesNotProceed(t *testing.T) {
	m := start(NewModel(claude.Defaults(), false))
	m = send(m, tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl})
	if _, ok := m.Result(); ok {
		t.Fatal("ctrl+c proceeds")
	}
}

func TestPickerNeverOverflowsTheTerminal(t *testing.T) {
	for _, w := range []int{60, 76, 80, 100, 101, 102, 120} {
		m := resize(start(NewModel(claude.Defaults(), false)), w, 40)
		for _, line := range strings.Split(m.View().Content, "\n") {
			if lw := lipgloss.Width(line); lw > w {
				t.Fatalf("line is %d cells on a %d-column terminal: %q", lw, w, ansi.Strip(line))
			}
		}
	}
}

// The first frame is drawn before the terminal reports its size.
func TestPickerFirstFrameIsAsTallAsTheRealOne(t *testing.T) {
	m := start(NewModel(claude.Defaults(), false))
	first := lipgloss.Height(m.View().Content)
	for _, w := range []int{80, 120} {
		if h := lipgloss.Height(resize(m, w, 40).View().Content); h != first {
			t.Errorf("first frame is %d lines, the %d-column one %d", first, w, h)
		}
	}
}

func TestPickerFitsEightyByTwentyFour(t *testing.T) {
	m := resize(start(NewModel(claude.Defaults(), false)), 80, 24)
	if h := lipgloss.Height(m.View().Content); h > 24 {
		t.Fatalf("view is %d lines on a 24-line terminal", h)
	}
}

func TestPickerLayoutByWidth(t *testing.T) {
	m := start(NewModel(claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on"}, false))
	wide := resize(m, 120, 34)
	for _, want := range []string{"Pack › Colors › Spinner › Pet › Extras", "crt — green phosphor", "┬", "▀"} {
		if !strings.Contains(view(wide), want) {
			t.Errorf("120 columns lack %q:\n%s", want, view(wide))
		}
	}
	// Clawd keeps his own orange (#d77757) in every pack.
	if !strings.Contains(wide.View().Content, "215;119;87") {
		t.Error("Clawd is not drawn in his own palette")
	}
	mid := resize(m, 90, 30)
	if v := view(mid); strings.Contains(v, "crt — green phosphor") || strings.Contains(v, "┬") || !strings.Contains(v, "add a dark mode toggle") {
		t.Errorf("90 columns should drop the bubble and Clawd but keep the preview:\n%s", v)
	}
	nopet := resize(start(NewModel(claude.Choice{Pack: "crt", Pet: "off", Bubbles: "on"}, false)), 120, 34)
	if v := view(nopet); strings.Contains(v, "┬") || strings.Contains(nopet.View().Content, "215;119;87") || !strings.Contains(v, "add a dark mode toggle") {
		t.Errorf("pet off should draw the preview only:\n%s", v)
	}
}

func TestPickerStepLineFollowsTheForm(t *testing.T) {
	m := resize(start(NewModel(claude.Defaults(), false)), 120, 34)
	for i, want := range []string{"Pack", "Pack", "Pet", "Extras"} {
		if got := m.stepIndex(); steps[got] != want {
			t.Fatalf("question %d: step %q, want %q", i, steps[got], want)
		}
		m = enter(m)
	}
}

func TestPickerWalkThroughAsIs(t *testing.T) {
	m := start(NewModel(claude.Defaults(), false))
	m = enter(down(m))  // pack: crt
	m = enter(m)        // use crt as is
	m = enter(down(m))  // pet: no pet
	m = enter(enter(m)) // bubbles on, reduced motion off
	c, ok := m.Result()
	if !ok || c != (claude.Choice{Pack: "crt", Pet: "off", Bubbles: "on"}) {
		t.Fatalf("got %+v ok=%v", c, ok)
	}
}

func TestPickerWalkThroughCustomize(t *testing.T) {
	m := start(NewModel(claude.Defaults(), false))
	m = enter(down(m)) // pack: crt
	m = enter(down(m)) // customize
	if got := steps[m.stepIndex()]; got != "Colors" {
		t.Fatalf("after Customize the form is on %s", got)
	}
	m = down(m) // theme: glowup
	if !strings.Contains(view(m), "Glowing") {
		t.Fatalf("the preview does not follow the theme:\n%s", view(m))
	}
	m = enter(m)
	m = enter(down(m)) // spinner: stock
	m = enter(m)       // pet: clawd
	m = enter(enter(m))
	c, ok := m.Result()
	if !ok || c != (claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on", Theme: "glowup", Spinner: "stock"}) {
		t.Fatalf("got %+v ok=%v", c, ok)
	}
}

func TestPickerCustomizeLeavingTheOwnValuesSendsThem(t *testing.T) {
	m := start(NewModel(claude.Defaults(), false))
	m = enter(m)       // pack: classic
	m = enter(down(m)) // customize
	for range 5 {      // colors, spinner, pet, bubbles, reduced motion
		m = enter(m)
	}
	c, ok := m.Result()
	if !ok || c.Theme != "classic" || c.Spinner != "pack" {
		t.Fatalf("got %+v ok=%v", c, ok)
	}
}

func TestPickerAsIsKeepsFlagTheme(t *testing.T) {
	m := start(NewModel(claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on", Theme: "dusk"}, false))
	if !strings.Contains(m.View().Content, "182;156;255") {
		t.Error("the --theme flag is not in the preview")
	}
	for range 5 {
		m = enter(m)
	}
	if c, ok := m.Result(); !ok || c.Theme != "dusk" || c.Spinner != "" {
		t.Fatalf("got %+v ok=%v", c, ok)
	}
}

func TestPickerInstalledLeaveItDoesNotProceed(t *testing.T) {
	m := start(NewModel(claude.Defaults(), true))
	for range 5 { // pack, as is, pet, bubbles, reduced motion
		m = enter(m)
	}
	m = send(m, tea.KeyPressMsg{Code: 'n', Text: "n"})
	if _, ok := m.Result(); ok {
		t.Fatal("leaving an installed glowup as it is still proceeds")
	}
}

func TestPickerShowsEveryPackOnARealTerminal(t *testing.T) {
	m := resize(start(NewModel(claude.Defaults(), false)), 120, 40)
	for _, name := range packs.Names() {
		if !strings.Contains(view(m), name) {
			t.Errorf("pack %s not listed:\n%s", name, view(m))
		}
	}
}

// The inline renderer strands a line each time the view shrinks, so no pack, theme,
// spinner, step, width or pet pick may change the view's height. The form column is
// padded to FormRows, so a group taller than that would break it too.
func TestPickerViewHeightIsConstant(t *testing.T) {
	for _, width := range []int{120, 90, 70} {
		m := resize(start(NewModel(claude.Defaults(), false)), width, 40)
		want := -1
		walk := []func(Model) Model{
			func(m Model) Model { return enter(m) },       // pack
			func(m Model) Model { return enter(down(m)) }, // mode: customize
			func(m Model) Model { return enter(m) },       // colors
			func(m Model) Model { return enter(m) },       // spinner
			func(m Model) Model { return enter(m) },       // pet
			func(m Model) Model { return enter(m) },       // bubbles
			func(m Model) Model { return m },              // reduced motion
		}
		for step, next := range walk {
			if h := lipgloss.Height(m.form.View()); h > FormRows {
				t.Fatalf("width %d, step %d: the form is %d lines, more than FormRows (%d)", width, step, h, FormRows)
			}
			for _, k := range looksOneAtATime() {
				m.choice.Pack, *m.colors, *m.spinner = k[0], cmp.Or(k[1], "classic"), cmp.Or(k[2], "pack")
				for _, pet := range []string{"clawd", "off"} {
					m.choice.Pet = pet
					h := lipgloss.Height(m.View().Content)
					if want < 0 {
						want = h
					}
					if h != want {
						t.Fatalf("width %d, step %d, %v, pet %s: %d lines, want %d", width, step, k, pet, h, want)
					}
				}
			}
			m = next(m)
		}
	}
}

package tui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

func TestPreviewShowsPackAndChoice(t *testing.T) {
	p, _ := packs.ByName("crt")
	out := Preview(p, claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "off", ReducedMotion: true})
	plain := ansi.Strip(out)
	for _, want := range []string{"crt", "green phosphor", p.Spinner.Word + "…", "Clawd", "bubbles off", "motion reduced", "● Read", "+12"} {
		if !strings.Contains(plain, want) {
			t.Errorf("preview lacks %q:\n%s", want, plain)
		}
	}
	// #33ff66 is crt's text color: the preview is drawn in the pack's own colors.
	if !strings.Contains(out, "51;255;102") {
		t.Error("preview does not use crt's text color")
	}
}

func TestPreviewNoPet(t *testing.T) {
	p, _ := packs.ByName("classic")
	if plain := ansi.Strip(Preview(p, claude.Choice{Pack: "classic", Pet: "off", Bubbles: "on"})); !strings.Contains(plain, "no pet") || strings.Contains(plain, "Clawd") {
		t.Fatalf("pet off still shows Clawd:\n%s", plain)
	}
}

func TestPreviewEveryPackFitsItsWidth(t *testing.T) {
	for _, p := range packs.All() {
		for _, line := range strings.Split(Preview(p, claude.Defaults()), "\n") {
			if w := lipgloss.Width(line); w != PreviewWidth {
				t.Errorf("%s: line is %d cells, want %d: %q", p.Name, w, PreviewWidth, ansi.Strip(line))
			}
		}
	}
}

func view(m Model) string { return ansi.Strip(m.View().Content) }

func TestPickerPreviewFollowsCursor(t *testing.T) {
	m := start(NewModel(claude.Choice{Pack: "crt", Pet: "clawd", Bubbles: "on"}, false))
	if v := view(m); !strings.Contains(v, "green phosphor") {
		t.Fatalf("starts off the flag's pack:\n%s", v)
	}
	m = send(m, tea.KeyPressMsg{Code: tea.KeyDown})
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

func TestPickerNarrowTerminalStacks(t *testing.T) {
	m := send(start(NewModel(claude.Defaults(), false)), tea.WindowSizeMsg{Width: 60, Height: 40})
	for _, line := range strings.Split(m.View().Content, "\n") {
		if w := lipgloss.Width(line); w > 60 {
			t.Fatalf("line is %d cells on a 60-column terminal: %q", w, ansi.Strip(line))
		}
	}
}

func TestPickerWalkThrough(t *testing.T) {
	m := start(NewModel(claude.Defaults(), false))
	m = enter(send(m, tea.KeyPressMsg{Code: tea.KeyDown})) // pack: crt
	m = enter(send(m, tea.KeyPressMsg{Code: tea.KeyDown})) // pet: no pet
	m = enter(enter(m))                                    // bubbles on, reduced motion off
	c, ok := m.Result()
	if !ok || c != (claude.Choice{Pack: "crt", Pet: "off", Bubbles: "on"}) {
		t.Fatalf("got %+v ok=%v", c, ok)
	}
}

func TestPickerInstalledLeaveItDoesNotProceed(t *testing.T) {
	m := start(NewModel(claude.Defaults(), true))
	for range 4 {
		m = enter(m)
	}
	m = send(m, tea.KeyPressMsg{Code: 'n', Text: "n"})
	if _, ok := m.Result(); ok {
		t.Fatal("leaving an installed glowup as it is still proceeds")
	}
}

func TestPickerShowsEveryPackOnARealTerminal(t *testing.T) {
	m := send(start(NewModel(claude.Defaults(), false)), tea.WindowSizeMsg{Width: 120, Height: 40})
	for _, name := range packs.Names() {
		if !strings.Contains(view(m), name+" · ") {
			t.Errorf("pack %s not listed:\n%s", name, view(m))
		}
	}
}

// The inline renderer strands a line each time the view shrinks, so cycling the
// pack list must never change the view's height.
func TestPickerViewHeightIsConstantAcrossPacks(t *testing.T) {
	for _, width := range []int{120, 70} {
		m := send(start(NewModel(claude.Defaults(), false)), tea.WindowSizeMsg{Width: width, Height: 40})
		want := -1
		for range packs.Names() {
			lines := strings.Split(m.View().Content, "\n")
			if want < 0 {
				want = len(lines)
			}
			if len(lines) != want {
				t.Errorf("width %d, pack %s: %d lines, want %d", width, m.choice.Pack, len(lines), want)
			}
			m = send(m, tea.KeyPressMsg{Code: tea.KeyDown})
		}
	}
}

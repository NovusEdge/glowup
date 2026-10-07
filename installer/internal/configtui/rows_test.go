package configtui

import (
	"slices"
	"testing"
)

func snap() Snapshot {
	var s Snapshot
	s.Format = 1
	s.State.Mix = Mix{Colors: "classic", Motion: "classic"}
	s.State.Pet, s.State.Bubbles = "clawd", "on"
	s.State.Colors.Accent = "#ff8800"
	s.State.Setup.Band = []string{"combo", "agents"}
	s.State.Setup.Tabs = []string{"plan"}
	s.State.Setup.Meter.Warn, s.State.Setup.Meter.Danger = 50, 80
	s.State.Setup.Bubbles.Moods, s.State.Setup.Bubbles.Ms = []string{"fail"}, 3000
	s.State.Setup.Pet.SleepMs = 60000
	s.State.Fields = []string{"ctx", "cost"}
	s.Options = Options{Packs: []string{"classic", "crt", "arcade"}, Spinners: []string{"orb", "comet"}, Pets: []string{"clawd", "robot", "off"},
		Fields: []string{"activity", "ctx", "cost"}, Band: []string{"combo", "agents", "meter", "plan"}, Tabs: []string{"plan", "agents"}, Moods: []string{"needs-you", "fail", "done"}, Bubbles: []string{"on", "haiku", "off"}}
	return s
}

func rowByID(t *testing.T, s Snapshot, sec int, id string) row {
	t.Helper()
	for _, r := range rowsOf(sec, s) {
		if r.id == id {
			return r
		}
	}
	t.Fatalf("no row %s", id)
	return row{}
}

func TestCycleWrapsBothWays(t *testing.T) {
	s := snap()
	pack := rowByID(t, s, 0, "pack")
	if got := cycleCmds(pack, s, 1); !slices.Equal(got, []string{"pack crt"}) {
		t.Fatal(got)
	}
	if got := cycleCmds(pack, s, -1); !slices.Equal(got, []string{"pack arcade"}) {
		t.Fatal(got)
	}
	s.State.Mix.Theme = "aurora"
	if got := cycleCmds(pack, s, 1); !slices.Equal(got, []string{"pack classic"}) {
		t.Fatal("a custom mix moves to the first pack:", got)
	}
}

func TestSpinnerMotionAndSteps(t *testing.T) {
	s := snap()
	if got := cycleCmds(rowByID(t, s, 0, "spinner"), s, 1); !slices.Equal(got, []string{"spinner orb"}) {
		t.Fatal(got)
	}
	if got := cycleCmds(rowByID(t, s, 0, "motion"), s, 1); !slices.Equal(got, []string{"motion reduced"}) {
		t.Fatal(got)
	}
	if got := cycleCmds(rowByID(t, s, 3, "sleep"), s, 1); !slices.Equal(got, []string{"setup pet.sleepMs 300000"}) {
		t.Fatal(got)
	}
	if got := cycleCmds(rowByID(t, s, 2, "meter.warn"), s, -1); !slices.Equal(got, []string{"setup meter.warn 45"}) {
		t.Fatal(got)
	}
	s.State.Setup.Meter.Danger = 99
	if got := cycleCmds(rowByID(t, s, 2, "meter.danger"), s, 1); got != nil {
		t.Fatal("past 99 sends nothing:", got)
	}
}

func TestChecklistToggleAndMove(t *testing.T) {
	s := snap()
	if cmd, msg := toggle(rowByID(t, s, 2, "band:meter"), s); cmd != "setup band combo,agents,meter" || msg != "" {
		t.Fatal(cmd, msg)
	}
	if cmd, _ := toggle(rowByID(t, s, 2, "band:combo"), s); cmd != "setup band agents" {
		t.Fatal(cmd)
	}
	if cmd, msg := toggle(rowByID(t, s, 2, "tabs:plan"), s); cmd != "" || msg != "Keep at least one." {
		t.Fatal("the last tab cannot be unchecked:", cmd, msg)
	}
	if cmd := move(rowByID(t, s, 4, "fields:cost"), s, -1); cmd != "statusline fields cost ctx" {
		t.Fatal(cmd)
	}
	if cmd := move(rowByID(t, s, 4, "fields:activity"), s, -1); cmd != "" {
		t.Fatal("an unchecked item does not move:", cmd)
	}
	s.State.Setup.Band = nil
	if cmd, _ := toggle(rowByID(t, s, 2, "band:combo"), s); cmd != "setup band combo" {
		t.Fatal(cmd)
	}
	s.State.Setup.Band = []string{"combo"}
	if cmd, _ := toggle(rowByID(t, s, 2, "band:combo"), s); cmd != "setup band none" {
		t.Fatal(cmd)
	}
}

func TestChecklistOrderIsCheckedThenTheRest(t *testing.T) {
	var ids []string
	for _, r := range rowsOf(4, snap()) {
		ids = append(ids, r.id)
	}
	if !slices.Equal(ids, []string{"fields:ctx", "fields:cost", "fields:activity"}) {
		t.Fatal(ids)
	}
}

func TestValues(t *testing.T) {
	s := snap()
	s.State.Mix.Overrides = map[string]string{"accent": "#ff8800"}
	if v := value(rowByID(t, s, 1, "color:accent"), s); v != "#ff8800 ●" {
		t.Fatal(v)
	}
	if v := value(rowByID(t, s, 3, "sleep"), s); v != "1 min" {
		t.Fatal(v)
	}
	if v := value(rowByID(t, s, 3, "bubbleMs"), s); v != "3 s" {
		t.Fatal(v)
	}
	if v := value(rowByID(t, s, 0, "spinner"), s); v != "pack default" {
		t.Fatal(v)
	}
}

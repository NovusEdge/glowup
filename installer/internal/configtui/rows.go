package configtui

import (
	"fmt"
	"slices"
	"strings"
)

type kind int

const (
	cycle kind = iota
	hexRow
	item
)

type row struct {
	kind  kind
	id    string // "pack", "color:accent", "band:combo", "meter.warn"
	label string
	group string // the checklist an item belongs to, or the heading its row sits under
}

var sections = []string{"Look", "Colors", "Pane", "Pet", "Status"}

var roles = []string{"accent", "text", "dim", "faint", "read", "edit", "shell", "agent", "pass", "fail", "panel", "addBg", "delBg", "sel"}

var (
	sleepSteps  = []int{15_000, 60_000, 300_000, 600_000}
	bubbleSteps = []int{1500, 3000, 5000, 8000}
)

// checklist is a list setting edited by toggling and moving its items.
type checklist struct {
	on      func(Snapshot) []string
	all     func(Snapshot) []string
	cmd     func([]string) string
	keepOne bool
}

func joinOrNone(v []string) string {
	if len(v) == 0 {
		return "none"
	}
	return strings.Join(v, ",")
}

var checklists = map[string]checklist{
	"band": {func(s Snapshot) []string { return s.State.Setup.Band }, func(s Snapshot) []string { return s.Options.Band },
		func(v []string) string { return "setup band " + joinOrNone(v) }, false},
	"tabs": {func(s Snapshot) []string { return s.State.Setup.Tabs }, func(s Snapshot) []string { return s.Options.Tabs },
		func(v []string) string { return "setup tabs " + joinOrNone(v) }, true},
	"moods": {func(s Snapshot) []string { return s.State.Setup.Bubbles.Moods }, func(s Snapshot) []string { return s.Options.Moods },
		func(v []string) string { return "setup bubbles.moods " + joinOrNone(v) }, false},
	"fields": {func(s Snapshot) []string { return s.State.Fields }, func(s Snapshot) []string { return s.Options.Fields },
		func(v []string) string { return "statusline fields " + strings.Join(v, " ") }, true},
}

// headings label the groups of rows in a section.
var headings = map[string]string{"band": "Band", "tabs": "Tabs", "moods": "Moods", "fields": "Status line", "meter": "Meter"}

// items lists the checked items in their order, then the unchecked ones.
func items(group string, s Snapshot) []row {
	c := checklists[group]
	on := c.on(s)
	order := append([]string(nil), on...)
	for _, x := range c.all(s) {
		if !slices.Contains(on, x) {
			order = append(order, x)
		}
	}
	out := make([]row, len(order))
	for i, x := range order {
		out[i] = row{kind: item, id: group + ":" + x, label: x, group: group}
	}
	return out
}

func rowsOf(section int, s Snapshot) []row {
	switch section {
	case 0:
		return []row{{kind: cycle, id: "pack", label: "Pack"}, {kind: cycle, id: "spinner", label: "Spinner"}, {kind: cycle, id: "motion", label: "Motion"}}
	case 1:
		out := make([]row, len(roles))
		for i, r := range roles {
			out[i] = row{kind: hexRow, id: "color:" + r, label: r}
		}
		return out
	case 2:
		out := append(items("band", s), items("tabs", s)...)
		return append(out, row{kind: cycle, id: "meter.warn", label: "Warn at", group: "meter"}, row{kind: cycle, id: "meter.danger", label: "Danger at", group: "meter"})
	case 3:
		out := []row{{kind: cycle, id: "pet", label: "Pet"}, {kind: cycle, id: "sleep", label: "Sleeps after"}, {kind: cycle, id: "bubbles", label: "Bubbles"}, {kind: cycle, id: "bubbleMs", label: "Bubble time"}}
		return append(out, items("moods", s)...)
	default:
		return items("fields", s)
	}
}

func plainPack(m Mix) string {
	if m.Colors == m.Motion && m.Theme == "" {
		return m.Colors
	}
	return ""
}

func duration(ms int) string {
	if ms >= 60_000 {
		return fmt.Sprintf("%d min", ms/60_000)
	}
	return fmt.Sprintf("%g s", float64(ms)/1000)
}

func colorOf(s Snapshot, role string) string {
	c := s.State.Colors
	return map[string]string{"accent": c.Accent, "text": c.Text, "dim": c.Dim, "faint": c.Faint, "read": c.Read, "edit": c.Edit, "shell": c.Shell,
		"agent": c.Agent, "pass": c.Pass, "fail": c.Fail, "panel": c.Panel, "addBg": c.AddBg, "delBg": c.DelBg, "sel": c.Sel}[role]
}

func value(r row, s Snapshot) string {
	st := s.State
	switch {
	case r.kind == hexRow:
		role := strings.TrimPrefix(r.id, "color:")
		if _, ok := st.Mix.Overrides[role]; ok {
			return colorOf(s, role) + " ●"
		}
		return colorOf(s, role)
	case r.kind == item:
		if slices.Contains(checklists[r.group].on(s), r.label) {
			return "[x]"
		}
		return "[ ]"
	}
	switch r.id {
	case "pack":
		if p := plainPack(st.Mix); p != "" {
			return p
		}
		return "custom mix"
	case "spinner":
		if st.Mix.Spinner == "" {
			return "pack default"
		}
		return st.Mix.Spinner
	case "motion":
		if st.Reduced {
			return "reduced"
		}
		return "full"
	case "pet":
		return st.Pet
	case "bubbles":
		return st.Bubbles
	case "sleep":
		return duration(st.Setup.Pet.SleepMs)
	case "bubbleMs":
		return duration(st.Setup.Bubbles.Ms)
	case "meter.warn":
		return fmt.Sprintf("%d%%", st.Setup.Meter.Warn)
	case "meter.danger":
		return fmt.Sprintf("%d%%", st.Setup.Meter.Danger)
	}
	return ""
}

// step moves dir places through xs from cur, wrapping. A cur not in xs starts from the first.
func step[T comparable](xs []T, cur T, dir int) T {
	i := slices.Index(xs, cur)
	if i < 0 {
		return xs[0]
	}
	return xs[(i+dir+len(xs))%len(xs)]
}

// cycleCmds is what ←/→ on a cycle row sends: absolute values, so a line the session
// applies twice lands in the same place. Nil when there is nothing to send.
func cycleCmds(r row, s Snapshot, dir int) []string {
	st := s.State
	switch r.id {
	case "pack":
		if len(s.Options.Packs) == 0 {
			return nil
		}
		return []string{"pack " + step(s.Options.Packs, plainPack(st.Mix), dir)}
	case "spinner":
		cur := st.Mix.Spinner
		if cur == "" {
			cur = "default"
		}
		return []string{"spinner " + step(append([]string{"default"}, s.Options.Spinners...), cur, dir)}
	case "motion":
		if st.Reduced {
			return []string{"motion full"}
		}
		return []string{"motion reduced"}
	case "pet":
		if len(s.Options.Pets) == 0 {
			return nil
		}
		return []string{"pet " + step(s.Options.Pets, st.Pet, dir)}
	case "bubbles":
		if len(s.Options.Bubbles) == 0 {
			return nil
		}
		return []string{"bubbles " + step(s.Options.Bubbles, st.Bubbles, dir)}
	case "sleep":
		return []string{fmt.Sprintf("setup pet.sleepMs %d", step(sleepSteps, st.Setup.Pet.SleepMs, dir))}
	case "bubbleMs":
		return []string{fmt.Sprintf("setup bubbles.ms %d", step(bubbleSteps, st.Setup.Bubbles.Ms, dir))}
	case "meter.warn", "meter.danger":
		cur := st.Setup.Meter.Warn
		if r.id == "meter.danger" {
			cur = st.Setup.Meter.Danger
		}
		next := cur + 5*dir
		if next < 1 || next > 99 {
			return nil
		}
		return []string{fmt.Sprintf("setup %s %d", r.id, next)}
	}
	return nil
}

// toggle checks or unchecks an item; a newly checked one goes last. msg is set when the
// TUI refuses the change itself.
func toggle(r row, s Snapshot) (cmd, msg string) {
	c := checklists[r.group]
	on := c.on(s)
	if i := slices.Index(on, r.label); i >= 0 {
		if c.keepOne && len(on) == 1 {
			return "", "Keep at least one."
		}
		return c.cmd(slices.Delete(slices.Clone(on), i, i+1)), ""
	}
	return c.cmd(append(slices.Clone(on), r.label)), ""
}

// move swaps a checked item with its neighbor; "" when it cannot move.
func move(r row, s Snapshot, dir int) string {
	c := checklists[r.group]
	on := slices.Clone(c.on(s))
	i := slices.Index(on, r.label)
	j := i + dir
	if i < 0 || j < 0 || j >= len(on) {
		return ""
	}
	on[i], on[j] = on[j], on[i]
	return c.cmd(on)
}

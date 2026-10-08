package configtui

import (
	"strings"

	"charm.land/bubbles/v2/help"
	kb "charm.land/bubbles/v2/key"
	"charm.land/lipgloss/v2"
)

// noRow is the row kind of a section with nothing to list.
const noRow kind = -1

type keyMap struct {
	Quit, Undo, Interrupt, Next, Prev, Up, Down, Left, Right kb.Binding
	Enter, Reset, Space, MoveDown, MoveUp                    kb.Binding
	Set, Cancel                                              kb.Binding // in the hex input
}

// keys is the one set of bindings the model matches and the help bar lists, so the bar
// cannot show a key the model ignores.
var keys = keyMap{
	Quit:      kb.NewBinding(kb.WithKeys("q"), kb.WithHelp("q", "keep & quit")),
	Undo:      kb.NewBinding(kb.WithKeys("esc", "ctrl+c"), kb.WithHelp("esc", "undo & quit")),
	Interrupt: kb.NewBinding(kb.WithKeys("ctrl+c")),
	Next:      kb.NewBinding(kb.WithKeys("tab"), kb.WithHelp("tab", "section")),
	Prev:      kb.NewBinding(kb.WithKeys("shift+tab")),
	Up:        kb.NewBinding(kb.WithKeys("up", "k")),
	Down:      kb.NewBinding(kb.WithKeys("down", "j")),
	Left:      kb.NewBinding(kb.WithKeys("left", "h")),
	Right:     kb.NewBinding(kb.WithKeys("right", "l")),
	Enter:     kb.NewBinding(kb.WithKeys("enter"), kb.WithHelp("enter", "edit")),
	Reset:     kb.NewBinding(kb.WithKeys("r"), kb.WithHelp("r", "reset")),
	Space:     kb.NewBinding(kb.WithKeys("space"), kb.WithHelp("space", "toggle")),
	MoveDown:  kb.NewBinding(kb.WithKeys("J", "shift+j")),
	MoveUp:    kb.NewBinding(kb.WithKeys("K", "shift+k")),
	Set:       kb.NewBinding(kb.WithKeys("enter"), kb.WithHelp("enter", "set")),
	Cancel:    kb.NewBinding(kb.WithKeys("esc"), kb.WithHelp("esc", "cancel")),
}

// helpKeys is the help bar for the focused row: what that kind of row takes, then the keys
// every row takes. ↑↓ and shift+tab work everywhere and stay unlisted.
func helpKeys(k kind, editing bool) []kb.Binding {
	if editing {
		return []kb.Binding{keys.Set, keys.Cancel}
	}
	var out []kb.Binding
	switch k {
	case cycle:
		out = append(out, kb.NewBinding(kb.WithKeys(append(keys.Left.Keys(), keys.Right.Keys()...)...), kb.WithHelp("←→", "change")))
	case hexRow:
		out = append(out, keys.Enter, keys.Reset)
	case item:
		out = append(out, keys.Space, kb.NewBinding(kb.WithKeys(append(keys.MoveDown.Keys(), keys.MoveUp.Keys()...)...), kb.WithHelp("J/K", "reorder")))
	}
	return append(out, keys.Next, keys.Quit, keys.Undo)
}

// styledHelp gives each binding's help text its colors. help.Model renders with blank
// styles, so a key and its description can take different colors.
func styledHelp(bs []kb.Binding, key, desc lipgloss.Style) []kb.Binding {
	out := make([]kb.Binding, len(bs))
	for i, b := range bs {
		h := b.Help()
		out[i] = kb.NewBinding(kb.WithKeys(b.Keys()...), kb.WithHelp(key.Render(h.Key), desc.Render(h.Desc)))
	}
	return out
}

// wrapHelp packs bindings into lines no wider than width. help.Model drops what does not
// fit, which would hide a quit key.
func wrapHelp(h help.Model, bs []kb.Binding, width int) string {
	var lines []string
	var row []kb.Binding
	for _, b := range bs {
		if len(row) > 0 && lipgloss.Width(h.ShortHelpView(append(row[:len(row):len(row)], b))) > width {
			lines = append(lines, h.ShortHelpView(row))
			row = nil
		}
		row = append(row, b)
	}
	if len(row) > 0 {
		lines = append(lines, h.ShortHelpView(row))
	}
	return strings.Join(lines, "\n")
}

// helpLines is the height of the tallest help set at width, so the block keeps its height
// as the cursor moves between kinds of row.
func helpLines(h help.Model, width int) int {
	n := 1
	for _, k := range []kind{noRow, cycle, hexRow, item} {
		n = max(n, strings.Count(wrapHelp(h, helpKeys(k, false), width), "\n")+1)
	}
	return max(n, strings.Count(wrapHelp(h, helpKeys(noRow, true), width), "\n")+1)
}

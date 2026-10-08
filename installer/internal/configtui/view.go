package configtui

import (
	"cmp"
	"os"
	"strings"

	"charm.land/bubbles/v2/help"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/colorprofile"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
	"github.com/novusedge/glowup/installer/internal/tui"
)

const (
	paneW       = 36
	previewW    = 40
	gap         = 2
	labelW      = 13
	rowsW       = paneW - 4 // the pane's border and one cell of padding each side
	withPreview = paneW + gap + previewW
	withClawd   = withPreview + gap + tui.ClawdWidth
	floorW      = 36
	floorH      = 13
	headerLines = 2 // the header and the blank under it
	statusLines = 1
	paneChrome  = 5 // two border rows, then the tab bar, its rule and a blank
)

// previewH is the preview's height at previewW; the pane is as tall, so the two line up.
var previewH = lipgloss.Height(tui.PreviewAt(tui.LookOf("classic", "", ""), claude.Defaults(), 0, previewW))

// lookOf turns the session's look into what the installer's preview draws. User packs are
// not in packs.json, so everything comes from the snapshot, apart from a built-in pack's description.
func lookOf(s Snapshot) tui.Look {
	builtin, _ := packs.ByName(s.Look.Name)
	sp, ok := packs.SpinnerByID(s.Look.Spinner)
	if !ok {
		sp = packs.Spinners()[0]
	}
	c := s.State.Colors
	return tui.Look{
		Pack: packs.Pack{Name: s.Look.Name, Border: s.Look.Border, Description: builtin.Description}, Colors: c,
		Bg: cmp.Or(s.Look.Bg, c.Panel), BorderColor: cmp.Or(s.Look.BorderColor, c.Faint), Word: cmp.Or(s.Look.Word, "Working"),
		Spinner: sp, SpinColor: cmp.Or(s.Look.SpinColor, c.Accent),
	}
}

// ink paints text in one color, bold or not, on one background. A focused row passes the
// sel color so the bar runs unbroken across the row.
type ink struct{ bg string }

func (i ink) fg(hex string, bold bool, s string) string {
	st := lipgloss.NewStyle().Foreground(lipgloss.Color(hex)).Bold(bold)
	if i.bg != "" {
		st = st.Background(lipgloss.Color(i.bg))
	}
	return st.Render(s)
}

func padTo(s string, w int) string { return s + strings.Repeat(" ", max(0, w-ansi.StringWidth(s))) }

func (m Model) heading(c packs.Colors, label string) string {
	var i ink
	rule := max(0, rowsW-2-ansi.StringWidth(label)-1)
	return "  " + i.fg(c.Dim, false, label) + " " + i.fg(c.Faint, false, strings.Repeat("─", rule))
}

// rowLines draws every row of the section, each rowsW wide, and says which line the
// cursor is on.
func (m Model) rowLines(c packs.Colors) (lines []string, cursor int) {
	rs, at := m.rows()
	group := ""
	for j, r := range rs {
		if r.group != group {
			group = r.group
			if h := headings[group]; h != "" {
				lines = append(lines, m.heading(c, h))
			}
		}
		focus := len(rs) > 0 && j == at
		var i ink
		if focus {
			i.bg = c.Sel
			cursor = len(lines)
		}
		mark := i.fg(c.Text, false, "  ")
		val := func(s string) string {
			if focus {
				return i.fg(c.Accent, true, s)
			}
			return i.fg(c.Text, false, s)
		}
		if focus {
			mark = i.fg(c.Accent, true, "❯ ")
		}
		var body string
		switch r.kind {
		case cycle:
			body = i.fg(c.Dim, false, padTo(ansi.Truncate(r.label, labelW-1, "…"), labelW)) + i.fg(c.Dim, false, "‹ ") + val(value(r, m.snap)) + i.fg(c.Dim, false, " ›")
		case hexRow:
			role := strings.TrimPrefix(r.id, "color:")
			hex, v := colorOf(m.snap, role), ""
			swatch := hex
			switch {
			case focus && m.editing:
				if t := m.input.Value(); len(t) == 6 {
					swatch = "#" + t
				}
				v = m.inputView(c)
			case strings.HasSuffix(value(r, m.snap), "●"):
				v = val(hex) + i.fg(c.Dim, false, " ●")
			default:
				v = val(hex)
			}
			body = i.fg(c.Dim, false, "▕") + i.fg(swatch, false, "██") + i.fg(c.Dim, false, "▏ ") + i.fg(c.Dim, false, padTo(role, 8)) + v
		case item:
			box, label := c.Dim, c.Dim
			if value(r, m.snap) == "[x]" {
				box, label = c.Text, c.Text
			}
			if focus {
				box, label = c.Accent, c.Accent
			}
			body = i.fg(box, focus, value(r, m.snap)) + i.fg(label, focus, " "+r.label)
		}
		line := ansi.Truncate(mark+body, rowsW, "…")
		lines = append(lines, line+i.fg(c.Text, false, strings.Repeat(" ", max(0, rowsW-ansi.StringWidth(line)))))
	}
	return lines, cursor
}

// inputView draws the hex input on the focused row's bar.
func (m Model) inputView(c packs.Colors) string {
	st := textinput.DefaultStyles(true)
	on := lipgloss.NewStyle().Foreground(lipgloss.Color(c.Accent)).Bold(true)
	if c.Sel != "" {
		on = on.Background(lipgloss.Color(c.Sel))
	}
	st.Focused.Prompt, st.Focused.Text, st.Blurred.Prompt, st.Blurred.Text = on, on, on, on
	st.Cursor.Blink = false
	m.input.SetStyles(st)
	return m.input.View()
}

// window keeps at most h lines with the cursor's line among them.
func window(lines []string, cursor, h int) []string {
	if h <= 0 {
		return nil
	}
	if len(lines) <= h {
		return lines
	}
	start := min(max(0, cursor-h/2), len(lines)-h)
	return lines[start : start+h]
}

// tabBar is the section names and, under the active one, an accent run in the rule.
func (m Model) tabBar(c packs.Colors) (names, rule string) {
	var i ink
	x := 0
	for n, s := range sections {
		w := ansi.StringWidth(s)
		if n == m.section {
			names += i.fg(c.Accent, true, s)
			rule += i.fg(c.Accent, false, strings.Repeat("━", w))
		} else {
			names += i.fg(c.Dim, false, s)
			rule += i.fg(c.Faint, false, strings.Repeat("─", w))
		}
		x += w
		if n < len(sections)-1 {
			names += "  "
			rule += i.fg(c.Faint, false, "──")
			x += 2
		}
	}
	pad := max(0, rowsW-x)
	return names + strings.Repeat(" ", pad), rule + i.fg(c.Faint, false, strings.Repeat("─", pad))
}

func (m Model) pane(l tui.Look, rowsH int) string {
	c := l.Colors
	names, rule := m.tabBar(c)
	rows, cursor := m.rowLines(c)
	lines := append([]string{names, rule, ""}, window(rows, cursor, rowsH)...)
	for len(lines) < 3+rowsH {
		lines = append(lines, "")
	}
	return lipgloss.NewStyle().Border(tui.BorderOf(l.Pack.Border)).BorderForeground(lipgloss.Color(l.BorderColor)).Padding(0, 1).
		Render(strings.Join(lines, "\n"))
}

// header is the title and the working directory, blockW wide.
func (m Model) header(c packs.Colors, blockW int) string {
	var i ink
	left := i.fg(c.Accent, true, "glowup") + i.fg(c.Faint, false, " / ") + i.fg(c.Dim, false, "config")
	cwd := m.snap.Cwd
	if home, err := os.UserHomeDir(); err == nil && home != "" && strings.HasPrefix(cwd, home) {
		cwd = "~" + cwd[len(home):]
	}
	avail := blockW - ansi.StringWidth(left) - 1
	if avail <= 0 {
		return ansi.Truncate(left, blockW, "")
	}
	if w := ansi.StringWidth(cwd); w > avail {
		cwd = ansi.TruncateLeft(cwd, w-avail+1, "…")
	}
	return left + strings.Repeat(" ", blockW-ansi.StringWidth(left)-ansi.StringWidth(cwd)) + i.fg(c.Dim, false, cwd)
}

func (m Model) helpBar(c packs.Colors, lines, width int) string {
	hm := help.New()
	sep := lipgloss.NewStyle().Foreground(lipgloss.Color(c.Faint))
	hm.Styles = help.Styles{Ellipsis: sep, ShortKey: lipgloss.NewStyle(), ShortDesc: lipgloss.NewStyle(), ShortSeparator: sep}
	k := noRow
	if rs, at := m.rows(); len(rs) > 0 {
		k = rs[at].kind
	}
	bs := styledHelp(helpKeys(k, m.editing),
		lipgloss.NewStyle().Foreground(lipgloss.Color(c.Text)), lipgloss.NewStyle().Foreground(lipgloss.Color(c.Dim)))
	out := wrapHelp(hm, bs, width)
	return out + strings.Repeat("\n", max(0, lines-strings.Count(out, "\n")-1))
}

func (m Model) screen(w, h int, l tui.Look) string {
	c := l.Colors
	if w < floorW || h < floorH {
		var i ink
		return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, ansi.Truncate(i.fg(c.Dim, false, "Make the window at least 36×13."), w, ""))
	}
	preview := w >= withPreview && h >= previewH+headerLines+statusLines+1
	clawd := preview && w >= withClawd && m.snap.State.Pet == "clawd"
	blockW := paneW
	switch {
	case clawd:
		blockW = withClawd
	case preview:
		blockW = withPreview
	}
	helpW := max(blockW, min(w, withPreview))
	blockW = helpW
	hl := helpLines(help.New(), helpW)
	paneH := min(previewH, h-headerLines-statusLines-hl)
	rowsH := max(0, paneH-paneChrome)

	cols := []string{m.pane(l, rowsH)}
	if preview {
		cols = append(cols, strings.Repeat(" ", gap),
			tui.PreviewAt(l, claude.Choice{Pet: m.snap.State.Pet, Bubbles: m.snap.State.Bubbles, ReducedMotion: m.snap.State.Reduced}, m.ticks, previewW))
	}
	if clawd {
		cols = append(cols, strings.Repeat(" ", gap), strings.Join(tui.ClawdColumnIn("pet clawd", l), "\n"))
	}
	var i ink
	status := i.fg(c.Fail, false, ansi.Truncate(m.status(), blockW, "…"))
	block := strings.Join([]string{m.header(c, blockW), "", lipgloss.PlaceHorizontal(blockW, lipgloss.Center, lipgloss.JoinHorizontal(lipgloss.Bottom, cols...)), status, m.helpBar(c, hl, helpW)}, "\n")
	return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, block)
}

func (m Model) View() tea.View {
	w, h := cmp.Or(m.width, 80), cmp.Or(m.height, 24)
	l := lookOf(m.snap)
	v := tea.NewView(m.screen(w, h, l))
	v.AltScreen = true
	v.WindowTitle = "glowup config"
	// OSC 10/11 need a profile that can show the colors; Bubble Tea resets them on exit
	if (m.profile == colorprofile.ANSI256 || m.profile == colorprofile.TrueColor) && l.Bg != "" {
		v.BackgroundColor, v.ForegroundColor = lipgloss.Color(l.Bg), lipgloss.Color(l.Colors.Text)
	}
	return v
}

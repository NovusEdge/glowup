package configtui

import (
	"cmp"
	"path/filepath"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
	"github.com/novusedge/glowup/installer/internal/tui"
)

const (
	sectionsW = 14
	rowsW     = 38
	labelW    = 14
	// the three columns and their gaps; the preview needs this much width and height
	wideW = sectionsW + 2 + rowsW + 2 + tui.PreviewWidth
	wideH = 30
)

// lookOf turns the session's look into what the installer's preview draws. User packs are
// not in packs.json, so everything comes from the snapshot.
func lookOf(s Snapshot) tui.Look {
	sp, ok := packs.SpinnerByID(s.Look.Spinner)
	if !ok {
		sp = packs.Spinners()[0]
	}
	c := s.State.Colors
	return tui.Look{
		Pack: packs.Pack{Name: s.Look.Name, Border: s.Look.Border}, Colors: c,
		Bg: cmp.Or(s.Look.Bg, c.Panel), BorderColor: cmp.Or(s.Look.BorderColor, c.Faint), Word: cmp.Or(s.Look.Word, "Working"),
		Spinner: sp, SpinColor: cmp.Or(s.Look.SpinColor, c.Accent),
	}
}

func fg(hex string) lipgloss.Style { return lipgloss.NewStyle().Foreground(lipgloss.Color(hex)) }

func (m Model) rowLines(l tui.Look, width int) (lines []string, cursor int) {
	rs, i := m.rows()
	c := l.Colors
	group := ""
	for j, r := range rs {
		if r.kind == item && r.group != group {
			group = r.group
			lines = append(lines, ansi.Truncate(fg(c.Dim).Render(checklists[group].label), width, "…"))
		}
		mark := "  "
		if j == i {
			mark, cursor = fg(c.Accent).Render("› "), len(lines)
		}
		v := value(r, m.snap)
		var line string
		switch r.kind {
		case cycle:
			line = fg(c.Text).Render(ansi.Truncate(r.label, labelW-1, "…")+strings.Repeat(" ", max(0, labelW-ansi.StringWidth(r.label)))) + fg(c.Accent).Render("‹ "+v+" ›")
		case hexRow:
			role := strings.TrimPrefix(r.id, "color:")
			if m.editing && j == i {
				v = "#" + m.buf + "▏"
			}
			line = fg(colorOf(m.snap, role)).Render("██ ") + fg(c.Text).Render(role+strings.Repeat(" ", max(0, 7-len(role)))) + fg(c.Dim).Render(v)
		case item:
			line = fg(c.Accent).Render(v) + " " + fg(c.Text).Render(r.label)
		}
		lines = append(lines, ansi.Truncate(mark+line, width, "…"))
	}
	return lines, cursor
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

func (m Model) View() tea.View {
	w, h := cmp.Or(m.width, 80), cmp.Or(m.height, 24)
	l := lookOf(m.snap)
	c := l.Colors
	wide := w >= wideW && h >= wideH

	title := fg(c.Accent).Bold(true).Render("glowup config")
	where := fg(c.Dim).Render(filepath.Base(m.snap.Cwd))
	header := ansi.Truncate(title+strings.Repeat(" ", max(1, w-ansi.StringWidth(title)-ansi.StringWidth(where)))+where, w, "")

	keys := "↑↓ move  ←→ change  tab section  enter edit  space toggle  J/K move  q keep & quit  esc undo & quit"
	if m.editing {
		keys = "type a hex color  enter set  esc cancel"
	}
	footer := []string{fg(c.Fail).Render(ansi.Truncate(m.status(), w, "…")), fg(c.Dim).Render(ansi.Truncate(keys, w, "…"))}

	var body string
	if wide {
		rows, cursor := m.rowLines(l, rowsW)
		var secs []string
		for i, s := range sections {
			if i == m.section {
				secs = append(secs, fg(c.Accent).Bold(true).Render("▸ "+s))
			} else {
				secs = append(secs, fg(c.Dim).Render("  "+s))
			}
		}
		rowsCol := lipgloss.NewStyle().Width(rowsW).Render(strings.Join(window(rows, cursor, h-4), "\n"))
		cols := []string{lipgloss.NewStyle().Width(sectionsW).Render(strings.Join(secs, "\n")), "  ", rowsCol, "  ",
			tui.Preview(l, claude.Choice{Pet: m.snap.State.Pet, Bubbles: m.snap.State.Bubbles, ReducedMotion: m.snap.State.Reduced}, m.ticks)}
		if w >= wideW+2+tui.ClawdWidth && m.snap.State.Pet == "clawd" {
			cols = append(cols, "  ", strings.Join(tui.ClawdColumn("pet clawd", l), "\n"))
		}
		body = lipgloss.JoinHorizontal(lipgloss.Top, cols...)
	} else {
		rows, cursor := m.rowLines(l, min(rowsW, w))
		var tabs []string
		for i, s := range sections {
			if i == m.section {
				tabs = append(tabs, fg(c.Accent).Bold(true).Render(s))
			} else {
				tabs = append(tabs, fg(c.Dim).Render(s))
			}
		}
		tabLine := ansi.Truncate(strings.Join(tabs, fg(c.Dim).Render(" · ")), w, "…")
		var sw []string
		for _, hex := range []string{c.Accent, c.Text, c.Read, c.Edit, c.Shell, c.Agent, c.Pass, c.Fail} {
			sw = append(sw, fg(hex).Render("██"))
		}
		strip := ansi.Truncate(strings.Join(sw, " ")+"  "+fg(l.SpinColor).Render(l.Word+"…"), w, "…")
		// header, tab line, strip and the two footer lines
		body = strings.Join(append(append([]string{tabLine}, window(rows, cursor, h-5)...), strip), "\n")
	}
	v := tea.NewView(header + "\n" + body + "\n" + strings.Join(footer, "\n"))
	v.AltScreen = true
	return v
}

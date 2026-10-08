package tui

import (
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/packs"
)

// ClawdWidth is the width of Clawd's column: his sprite is 24 cells wide, and the
// speech bubble above him is as wide.
const ClawdWidth = 24

// bubbleRows is how many lines of text the bubble always has, so it never changes height.
const bubbleRows = 2

// clawdLines draws Clawd's idle frame from the half-block rows exported from
// hooks/pets.ts. He keeps his own palette in every pack. Blank cells carry no color, so
// the terminal's background shows around him.
func clawdLines() []string {
	var out []string
	for _, row := range packs.ClawdSprite().Rows {
		var b strings.Builder
		for _, s := range row {
			if strings.TrimSpace(s.Text) == "" && s.Bg == "" {
				b.WriteString(s.Text)
				continue
			}
			st := lipgloss.NewStyle().Foreground(lipgloss.Color(s.Color))
			if s.Bg != "" {
				st = st.Background(lipgloss.Color(s.Bg))
			}
			b.WriteString(st.Render(s.Text))
		}
		out = append(out, b.String())
	}
	return out
}

// bubble is a speech bubble ClawdWidth wide with text wrapped inside it, whose tail points
// down at Clawd's head.
func bubble(text string, box lipgloss.Border, border, fg string) []string {
	const w = ClawdWidth - 2
	lines := strings.Split(ansi.Wordwrap(text, w-2, ""), "\n")
	if len(lines) > bubbleRows {
		lines = append(lines[:bubbleRows-1], ansi.Truncate(strings.Join(lines[bubbleRows-1:], " "), w-2, "…"))
	}
	for len(lines) < bubbleRows {
		lines = append(lines, "")
	}
	bd := lipgloss.NewStyle().Foreground(lipgloss.Color(border))
	tx := lipgloss.NewStyle().Foreground(lipgloss.Color(fg))
	out := []string{bd.Render(box.TopLeft + strings.Repeat(box.Top, w) + box.TopRight)}
	for _, l := range lines {
		out = append(out, bd.Render(box.Left)+" "+tx.Render(l)+strings.Repeat(" ", w-2-ansi.StringWidth(l))+" "+bd.Render(box.Right))
	}
	tee := "┬"
	switch box.Bottom {
	case "━":
		tee = "┳"
	case "═":
		tee = "╦"
	}
	return append(out, bd.Render(box.BottomLeft+strings.Repeat(box.Bottom, w/2)+tee+strings.Repeat(box.Bottom, w-w/2-1)+box.BottomRight))
}

// ClawdColumn is the bubble over Clawd, ClawdWidth cells wide.
func ClawdColumn(caption string, l Look) []string {
	return append(bubble(caption, lipgloss.RoundedBorder(), l.Colors.Accent, l.Colors.Text), clawdLines()...)
}

// ClawdColumnIn is ClawdColumn with the bubble drawn in the look's border style and color,
// like the preview beside it.
func ClawdColumnIn(caption string, l Look) []string {
	return append(bubble(caption, BorderOf(l.Pack.Border), l.BorderColor, l.Colors.Text), clawdLines()...)
}

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

// PetWidth is the width of a pet's column. A pet narrower than Clawd still gets his
// width, so the bubble has room for its caption.
func PetWidth(p packs.Pet) int { return max(ClawdWidth, p.Cols) }

// petLines draws the frame of p's idle animation showing elapsedMs in, from the half-block
// rows exported from hooks/pets.ts. A pet keeps its own palette in every pack. Blank cells
// carry no color, so the terminal's background shows around it.
func petLines(p packs.Pet, elapsedMs int) []string {
	var out []string
	for _, row := range p.FrameAt(elapsedMs).Rows {
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

// bubble is a speech bubble width cells wide with text wrapped inside it, whose tail points
// down at the pet's head.
func bubble(text string, width int, box lipgloss.Border, border, fg string) []string {
	w := width - 2
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

// ClawdColumn is the bubble over Clawd standing still, ClawdWidth cells wide.
func ClawdColumn(caption string, l Look) []string {
	p, _ := packs.PetByID("clawd")
	return append(bubble(caption, ClawdWidth, lipgloss.RoundedBorder(), l.Colors.Accent, l.Colors.Text), petLines(p, 0)...)
}

// PetColumnIn is the bubble over p elapsedMs into its idle animation, PetWidth(p) cells wide,
// with the bubble drawn in the look's border style and color like the preview beside it.
func PetColumnIn(p packs.Pet, caption string, l Look, elapsedMs int) []string {
	return append(bubble(caption, PetWidth(p), BorderOf(l.Pack.Border), l.BorderColor, l.Colors.Text), petLines(p, elapsedMs)...)
}

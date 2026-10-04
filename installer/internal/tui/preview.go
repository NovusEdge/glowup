package tui

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

// PreviewWidth is the preview's outer width in cells, border included. The form
// takes the rest; below FormWidth+PreviewWidth+2 columns the preview moves under the form.
const PreviewWidth = 40

// clawdColor is CLAWD in hooks/motion.ts: Clawd keeps his color in every pack.
const clawdColor = "#d77757"

func borderOf(name string) lipgloss.Border {
	switch name {
	case "bold":
		return lipgloss.ThickBorder()
	case "single":
		return lipgloss.NormalBorder()
	case "double":
		return lipgloss.DoubleBorder()
	case "classic":
		return lipgloss.ASCIIBorder()
	default:
		return lipgloss.RoundedBorder()
	}
}

// Preview draws a sample of glowup in pack p with choice c: palette swatches,
// two tool rows, the spinner with its word, the pet and the extras.
func Preview(p packs.Pack, c claude.Choice) string {
	bg := lipgloss.Color(p.Bg)
	fg := func(hex string) lipgloss.Style {
		return lipgloss.NewStyle().Foreground(lipgloss.Color(hex)).Background(bg)
	}
	col := p.Colors
	gap := fg(col.Text).Render(" ")

	title := fg(col.Accent).Bold(true).Render(p.Name) + gap + fg(col.Dim).Render(p.Description)

	var sw []string
	for _, hex := range []string{col.Accent, col.Text, col.Read, col.Edit, col.Shell, col.Agent, col.Pass, col.Fail} {
		sw = append(sw, fg(hex).Render("██"))
	}
	swatches := strings.Join(sw, gap)

	read := fg(col.Read).Render("● Read") + gap + fg(col.Text).Render("hooks/band.tsx")
	edit := fg(col.Edit).Render("● Edit") + gap + fg(col.Text).Render("README.md") + gap +
		fg(col.Pass).Render("+12") + gap + fg(col.Fail).Render("−3")

	var spin []string
	for _, row := range p.Spinner.Frame {
		var b strings.Builder
		for _, cell := range row {
			st := lipgloss.NewStyle().Foreground(lipgloss.Color(cell.Fg)).Background(bg)
			if cell.Bg != "" {
				st = st.Background(lipgloss.Color(cell.Bg))
			}
			b.WriteString(st.Render(cell.Ch))
		}
		spin = append(spin, b.String())
	}
	word := fg(p.Spinner.Color).Render(p.Spinner.Word + "…")
	spinner := lipgloss.JoinHorizontal(lipgloss.Center, strings.Join(spin, "\n"), gap, word)

	pet := fg(col.Dim).Render("no pet")
	if c.Pet == "clawd" {
		pet = fg(clawdColor).Render("▐▛█▜▌") + gap + fg(col.Text).Render("Clawd")
	}
	extras := fg(col.Dim).Render("bubbles " + c.Bubbles + " · motion " + motion(c.ReducedMotion))

	body := lipgloss.JoinVertical(lipgloss.Left, title, "", swatches, "", read, edit, "", spinner, "", pet, extras)
	return lipgloss.NewStyle().
		Width(PreviewWidth).
		Padding(0, 1).
		Background(bg).
		Border(borderOf(p.Border)).
		BorderForeground(lipgloss.Color(p.BorderColor)).
		BorderBackground(bg).
		Render(body)
}

func motion(reduced bool) string {
	if reduced {
		return "reduced"
	}
	return "full"
}

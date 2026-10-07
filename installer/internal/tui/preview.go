package tui

import (
	"cmp"
	"fmt"
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

// PreviewWidth is the preview's outer width in cells, border included.
const PreviewWidth = 44

// inner is the width of the preview's content: the box minus border and one cell of padding each side.
const inner = PreviewWidth - 4

// Look is what the preview draws: a pack, with a theme's colors and a spinner on top when picked.
type Look struct {
	Pack        packs.Pack
	Catalog     *packs.CatalogEntry // set for an official pack, whose own colors the installer does not have
	Colors      packs.Colors
	Bg          string
	BorderColor string
	Word        string
	Spinner     packs.SpinnerAnim
	SpinColor   string
	OwnColors   bool // no theme on top of the pack
	OwnSpinner  bool
}

// LookOf resolves the look the mod would show for pack, theme and spinner, the way
// hooks/packs.ts resolveLook does. An empty or "classic" theme and an empty or "pack"
// spinner mean the pack's own. An unknown pack falls back to classic. A catalog pack
// is drawn on classic's frame and ignores the theme and spinner.
func LookOf(pack, theme, spinner string) Look {
	p, ok := packs.ByName(pack)
	var entry *packs.CatalogEntry
	if !ok {
		p, _ = packs.ByName("classic")
		for _, e := range packs.Catalog() {
			if e.Name == pack {
				// The colors arrive with the download, so the frame is classic's under the entry's name.
				p.Name, p.Description = e.Name, e.Description
				entry = &e
				theme, spinner = "", ""
			}
		}
	}
	l := Look{Pack: p, Catalog: entry, Colors: p.Colors, Bg: p.Bg, BorderColor: p.BorderColor, Word: p.Spinner.Word, OwnColors: true, OwnSpinner: true}
	if t, ok := packs.ThemeByName(theme); ok && theme != "classic" {
		l.Colors, l.Bg, l.BorderColor, l.Word, l.OwnColors = t.Colors, t.Colors.Panel, t.Colors.Faint, t.Word, false
	}
	id := p.Spinner.ID
	if s, ok := packs.SpinnerByID(spinner); ok {
		id, l.OwnSpinner = s.ID, false
	}
	l.Spinner, _ = packs.SpinnerByID(id)
	l.SpinColor = cmp.Or(p.Spinner.Color, l.Colors.Accent)
	return l
}

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

// paint draws text on one background. Every cell the preview emits goes through it, so no
// cell falls back to the terminal's background.
type paint struct{ bg string }

func (p paint) on(fg, s string) string {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(fg)).Background(lipgloss.Color(p.bg)).Render(s)
}

func (p paint) bold(fg, s string) string {
	return lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(fg)).Background(lipgloss.Color(p.bg)).Render(s)
}

func (p paint) on2(fg, bg, s string) string {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(fg)).Background(lipgloss.Color(bg)).Render(s)
}

func (p paint) blank(n int) string {
	if n <= 0 {
		return ""
	}
	return p.on(p.bg, strings.Repeat(" ", n))
}

// fit cuts line to w cells and pads what is left with the background.
func (p paint) fit(line string, w int) string {
	line = ansi.Truncate(line, w, "…")
	return line + p.blank(w-lipgloss.Width(line))
}

func rgb(hex string) [3]int {
	var c [3]int
	for i := range c {
		v, _ := strconv.ParseUint(hex[1+2*i:3+2*i], 16, 8)
		c[i] = int(v)
	}
	return c
}

func mix(a, b string, t float64) string {
	x, y := rgb(a), rgb(b)
	out := "#"
	for i := range x {
		out += fmt.Sprintf("%02x", int(float64(x[i])+(float64(y[i])-float64(x[i]))*t+0.5))
	}
	return out
}

// shade puts one cell of an exported spinner frame onto the look. Frames are drawn in
// white on black, so a gray is a brightness: it becomes that much of tint over the
// preview's background. A cell that is not gray (Clawd's own orange) keeps its color.
func shade(hex, tint, bg string) string {
	c := rgb(hex)
	if c[0] != c[1] || c[1] != c[2] {
		return hex
	}
	return mix(bg, tint, float64(c[0])/255)
}

// TickMs is how often the picker redraws the spinner.
const TickMs = 120

// spinnerRows is the tallest spinner the mod has. Every preview is padded to it so the
// view never changes height when the spinner does.
func spinnerRows() int {
	n := 0
	for _, s := range packs.Spinners() {
		for _, f := range s.Frames {
			n = max(n, len(f))
		}
	}
	return n
}

func (l Look) spinnerLines(p paint, tick int, still bool) []string {
	frames := l.Spinner.Frames
	i := 0
	if !still {
		i = tick * TickMs / l.Spinner.Ms % len(frames)
	}
	tint := l.SpinColor
	if l.Spinner.Text {
		tint = l.Colors.Text
	}
	var out []string
	for _, row := range frames[i] {
		var b strings.Builder
		for _, c := range row {
			bg := l.Bg
			if c.Bg != "" {
				bg = shade(c.Bg, tint, l.Bg)
			}
			b.WriteString(p.on2(shade(c.Fg, tint, l.Bg), bg, c.Ch))
		}
		out = append(out, b.String())
	}
	for len(out) < spinnerRows() {
		out = append(out, "")
	}
	return out
}

// Preview draws a sample of glowup in the look l: a chat exchange, a tool box with a
// diff, the spinner with its word and the palette. The spinner moves with tick unless
// reduced motion is on. Every cell carries the look's background.
func Preview(l Look, c claude.Choice, tick int) string {
	p := paint{bg: l.Bg}
	col := l.Colors
	sp := p.blank(1)
	bd := lipgloss.NewStyle().Foreground(lipgloss.Color(l.BorderColor)).Background(lipgloss.Color(l.Bg))
	box := borderOf(l.Pack.Border)

	title := p.bold(col.Accent, l.Pack.Name) + sp + p.on(col.Dim, l.Pack.Description)

	user := p.bold(col.Accent, "›") + sp + p.on(col.Text, "add a dark mode toggle")
	reply := p.on(col.Accent, "●") + sp + p.on(col.Dim, "On it. Reading the styles first.")

	tb := lipgloss.NewStyle().Foreground(lipgloss.Color(col.Dim)).Background(lipgloss.Color(l.Bg))
	left := tb.Render(box.TopLeft+box.Top+" ") + p.bold(col.Edit, "● Edit") + sp + p.on(col.Text, "theme.css") + sp
	right := sp + p.on(col.Pass, "+12") + sp + p.on(col.Fail, "−3") + sp + tb.Render(box.Top+box.TopRight)
	top := left + tb.Render(strings.Repeat(box.Top, max(1, inner-lipgloss.Width(left)-lipgloss.Width(right)))) + right
	side := func(fg, bg, text string) string {
		return tb.Render(box.Left) + p.on2(fg, bg, ansi.Truncate(text, inner-2, "…")+strings.Repeat(" ", max(0, inner-2-ansi.StringWidth(text)))) + tb.Render(box.Right)
	}
	del := side(col.Fail, col.DelBg, " − color: #111")
	add := side(col.Pass, col.AddBg, " + color: var(--fg)")
	bottom := tb.Render(box.BottomLeft + strings.Repeat(box.Bottom, inner-2) + box.BottomRight)

	spin := l.spinnerLines(p, tick, c.ReducedMotion)
	spin[0] += sp + p.on(l.SpinColor, l.Word+"…")

	swatches := p.on(col.Dim, "downloads in your first session")
	if l.Catalog == nil {
		var sw []string
		for _, hex := range []string{col.Accent, col.Text, col.Read, col.Edit, col.Shell, col.Agent, col.Pass, col.Fail} {
			sw = append(sw, p.on(hex, "██"))
		}
		swatches = strings.Join(sw, sp)
	}

	pet := "Clawd"
	if c.Pet == "off" {
		pet = "off"
	}
	footer := p.on(col.Dim, "pet "+pet+" · bubbles "+c.Bubbles+" · motion "+motion(c.ReducedMotion))

	rows := []string{title, "", user, reply, "", top, del, add, bottom, ""}
	rows = append(rows, spin...)
	rows = append(rows, "", swatches, footer)

	line := func(s string) string {
		return bd.Render(box.Left) + p.blank(1) + p.fit(s, inner) + p.blank(1) + bd.Render(box.Right)
	}
	out := []string{bd.Render(box.TopLeft + strings.Repeat(box.Top, PreviewWidth-2) + box.TopRight), line("")}
	for _, r := range rows {
		out = append(out, line(r))
	}
	out = append(out, line(""), bd.Render(box.BottomLeft+strings.Repeat(box.Bottom, PreviewWidth-2)+box.BottomRight))
	return strings.Join(out, "\n")
}

func motion(reduced bool) string {
	if reduced {
		return "reduced"
	}
	return "full"
}

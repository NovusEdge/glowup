// Package tui is the installer's picker and progress spinner.
package tui

import (
	"cmp"
	"os"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

const (
	FormWidth = 30
	// FormRows is the height the form column is padded to. The groups differ in height
	// (four packs, seven themes, eleven spinner options) and bubbletea's inline renderer
	// strands a line each time the view gets shorter, so the form never draws less than this.
	FormRows = 16

	// With room for all three columns Clawd and his bubble stand left of the form.
	// Below it the form and preview sit side by side, and below that the preview
	// moves under the form.
	fullWidth = ClawdWidth + 2 + FormWidth + 2 + PreviewWidth
	pairWidth = FormWidth + 2 + PreviewWidth
)

var steps = []string{"Pack", "Colors", "Spinner", "Pet", "Extras"}

type tickMsg struct{}

func tick() tea.Cmd {
	return tea.Tick(TickMs*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} })
}

// Model is the picker: a huh form in the middle, Clawd on its left and the live
// preview on its right. The form's fields write straight into the values below, so
// everything follows the cursor.
type Model struct {
	form    *huh.Form
	choice  *claude.Choice // the flags' values; Theme and Spinner stay as given unless Customize
	mode    *string        // "asis" or "custom"
	colors  *string        // a theme name, or "classic" for the pack's own
	spinner *string        // a spinner id, or "pack"
	update  *bool
	asked   bool // the "update settings?" question is on the form
	width   int
	ticks   int
}

// NewModel starts the picker on in. When installed is true the form ends with a
// question asking whether to update the settings of the glowup already there.
func NewModel(in claude.Choice, installed bool) Model {
	c := in
	update := true
	mode := "asis"
	colors := cmp.Or(in.Theme, "classic")
	spinner := cmp.Or(in.Spinner, "pack")

	var packOpts []huh.Option[string]
	for _, n := range packs.Names() {
		packOpts = append(packOpts, huh.NewOption(n, n))
	}
	for _, e := range packs.Catalog() {
		packOpts = append(packOpts, huh.NewOption(e.Name, e.Name))
	}
	themeOpts := []huh.Option[string]{huh.NewOption("Pack's own", "classic")}
	for _, n := range packs.ThemeNames() {
		if n != "classic" {
			themeOpts = append(themeOpts, huh.NewOption(n, n))
		}
	}
	spinOpts := []huh.Option[string]{huh.NewOption("Pack's own", "pack")}
	for _, id := range packs.SpinnerIDs() {
		spinOpts = append(spinOpts, huh.NewOption(id, id))
	}
	// A catalog pack's colors and spinner come with the download, so there is nothing to customize.
	custom := func() bool { return mode != "custom" || packs.InCatalog(c.Pack) }

	groups := []*huh.Group{
		huh.NewGroup(huh.NewSelect[string]().Key("pack").Title("Pick a pack").
			Description("Change later: /glowup pack").
			Options(packOpts...).Value(&c.Pack)),
		huh.NewGroup(huh.NewSelect[string]().Key("mode").
			TitleFunc(func() string { return "Use " + c.Pack + " as is?" }, &c.Pack).
			Description("Customize picks colors and spinner on their own.").
			OptionsFunc(func() []huh.Option[string] {
				return []huh.Option[string]{huh.NewOption("Use "+c.Pack+" as is", "asis"), huh.NewOption("Customize", "custom")}
			}, &c.Pack).Value(&mode)).WithHideFunc(func() bool { return packs.InCatalog(c.Pack) }),
		huh.NewGroup(huh.NewSelect[string]().Key("colors").Title("Pick the colors").
			Description("The pack's own, or a theme.").
			Options(themeOpts...).Value(&colors)).WithHideFunc(custom),
		huh.NewGroup(huh.NewSelect[string]().Key("spinner").Title("Pick the spinner").
			Description("The pack's own, or any spinner.").
			Options(spinOpts...).Value(&spinner)).WithHideFunc(custom),
		huh.NewGroup(huh.NewSelect[string]().Key("pet").Title("Pick a pet").
			Options(huh.NewOption("Clawd", "clawd"), huh.NewOption("No pet", "off")).Value(&c.Pet)),
		huh.NewGroup(
			huh.NewSelect[string]().Key("bubbles").Title("Speech bubbles").
				Options(huh.NewOption("On", "on"), huh.NewOption("Off", "off"), huh.NewOption("Haiku lines (small paid calls)", "haiku")).Value(&c.Bubbles),
			huh.NewConfirm().Key("reducedMotion").Title("Reduced motion").
				Description("Turns off glowup's shimmer and spinner animation.").
				Affirmative("On").Negative("Off").Value(&c.ReducedMotion),
		),
	}
	if installed {
		groups = append(groups, huh.NewGroup(huh.NewConfirm().Key("update").
			Title("glowup is already installed").
			Description("Update its settings to these choices?").
			Affirmative("Update settings").Negative("Leave it").Value(&update)))
	}
	form := huh.NewForm(groups...).WithWidth(FormWidth).WithShowHelp(true).WithTheme(huh.ThemeFunc(theme))
	return Model{form: form, choice: &c, mode: &mode, colors: &colors, spinner: &spinner, update: &update, asked: installed}
}

func (m Model) Init() tea.Cmd { return tea.Batch(m.form.Init(), tick()) }

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tickMsg:
		m.ticks++
		return m, tick()
	case tea.WindowSizeMsg:
		m.width = msg.Width
	}
	f, cmd := m.form.Update(msg)
	if ff, ok := f.(*huh.Form); ok {
		m.form = ff
	}
	if m.form.State != huh.StateNormal {
		return m, tea.Quit
	}
	return m, cmd
}

// current is the choice as it stands: Customize's colors and spinner count only while
// Customize is the pick.
func (m Model) current() claude.Choice {
	c := *m.choice
	if *m.mode == "custom" && !packs.InCatalog(c.Pack) {
		c.Theme, c.Spinner = *m.colors, *m.spinner
	}
	return c
}

// stepIndex is the index into steps of the question the cursor is on.
func (m Model) stepIndex() int {
	f := m.form.GetFocusedField()
	if f == nil {
		return len(steps) - 1
	}
	switch f.GetKey() {
	case "colors":
		return 1
	case "spinner":
		return 2
	case "pet":
		return 3
	case "bubbles", "reducedMotion", "update":
		return 4
	}
	return 0
}

// caption is what Clawd's bubble says: the current pick.
func (m Model) caption(l Look, c claude.Choice) string {
	switch m.stepIndex() {
	case 1:
		if l.OwnColors {
			return l.Pack.Name + " — its own colors"
		}
		return c.Theme + " — theme colors"
	case 2:
		if l.OwnSpinner {
			return l.Spinner.ID + " — the pack's own spinner"
		}
		return l.Spinner.ID + " — " + l.Spinner.Name
	case 3:
		if c.Pet == "off" {
			return "no pet — just the look"
		}
		return "Clawd — your pet"
	case 4:
		return "bubbles " + c.Bubbles + ", motion " + motion(c.ReducedMotion)
	}
	return l.Pack.Name + " — " + l.Pack.Description
}

func (m Model) stepLine(l Look) string {
	cur := m.stepIndex()
	on := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(l.Colors.Accent))
	off := lipgloss.NewStyle().Foreground(lipgloss.Color(l.Colors.Dim))
	parts := make([]string, len(steps))
	for i, s := range steps {
		parts[i] = off.Render(s)
		if i == cur {
			parts[i] = on.Render(s)
		}
	}
	return strings.Join(parts, off.Render(" › "))
}

func (m Model) View() tea.View {
	c := m.current()
	l := LookOf(c.Pack, c.Theme, c.Spinner)
	form := lipgloss.NewStyle().Width(FormWidth).Height(FormRows).Render(m.form.View())
	preview := Preview(l, c, m.ticks)
	header := m.stepLine(l) + "\n"

	var body string
	switch {
	// Width 0 is the first frame, drawn before the terminal has said how wide it is. It
	// must be as tall as the real layout, or the renderer leaves the first frame behind.
	case m.width == 0 || m.width >= pairWidth:
		cols := []string{form, "  ", preview}
		if m.width >= fullWidth && c.Pet != "off" {
			col := clawdColumn(m.caption(l, c), l)
			h := max(lipgloss.Height(form), lipgloss.Height(preview))
			pad := strings.Repeat("\n", max(0, h-len(col)))
			cols = append([]string{pad + strings.Join(col, "\n"), "  "}, cols...)
		}
		body = lipgloss.JoinHorizontal(lipgloss.Top, cols...)
	default:
		body = lipgloss.JoinVertical(lipgloss.Left, form, preview)
	}
	return tea.NewView(header + "\n" + body)
}

// Result is the choice and whether to go ahead: false when the person pressed
// ctrl+c or chose to leave an installed glowup as it is.
func (m Model) Result() (claude.Choice, bool) {
	ok := m.form.State == huh.StateCompleted && (!m.asked || *m.update)
	return m.current(), ok
}

// Pick runs the picker on the terminal.
func Pick(in claude.Choice, installed bool) (claude.Choice, bool, error) {
	final, err := tea.NewProgram(NewModel(in, installed), tea.WithColorProfile(ColorProfile(os.Stdout, os.Environ()))).Run()
	if err != nil {
		return in, false, err
	}
	c, ok := final.(Model).Result()
	return c, ok, nil
}

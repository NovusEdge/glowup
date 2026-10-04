// Package tui is the installer's picker and progress spinner.
package tui

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"

	"github.com/novusedge/glowup/installer/internal/claude"
	"github.com/novusedge/glowup/installer/internal/packs"
)

// FormWidth is the width the form is given beside the preview.
const FormWidth = 36

// Model is the picker: a huh form on the left, the live preview on the right.
// The form's fields write straight into *choice, so the preview follows the cursor.
type Model struct {
	form   *huh.Form
	choice *claude.Choice
	update *bool
	asked  bool // the "update settings?" question is on the form
	width  int
}

// NewModel starts the picker on in. When installed is true the form ends with a
// question asking whether to update the settings of the glowup already there.
func NewModel(in claude.Choice, installed bool) Model {
	c := in
	update := true
	var packOpts []huh.Option[string]
	for _, p := range packs.All() {
		packOpts = append(packOpts, huh.NewOption(p.Name+" · "+p.Description, p.Name))
	}
	groups := []*huh.Group{
		huh.NewGroup(huh.NewSelect[string]().Key("pack").Title("Pick a pack").
			Description("Colors, rows and spinner. Change it later with /glowup pack.").
			Options(packOpts...).Value(&c.Pack)),
		huh.NewGroup(huh.NewSelect[string]().Key("pet").Title("Pick a pet").
			Options(huh.NewOption("Clawd", "clawd"), huh.NewOption("No pet", "off")).Value(&c.Pet)),
		huh.NewGroup(
			huh.NewSelect[string]().Key("bubbles").Title("Speech bubbles").
				Options(huh.NewOption("On", "on"), huh.NewOption("Off", "off")).Value(&c.Bubbles),
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
	form := huh.NewForm(groups...).WithWidth(FormWidth).WithShowHelp(true)
	return Model{form: form, choice: &c, update: &update, asked: installed}
}

func (m Model) Init() tea.Cmd { return m.form.Init() }

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if ws, ok := msg.(tea.WindowSizeMsg); ok {
		m.width = ws.Width
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

func (m Model) View() tea.View {
	p, _ := packs.ByName(m.choice.Pack)
	form, preview := m.form.View(), Preview(p, *m.choice)
	if m.width > 0 && m.width < FormWidth+PreviewWidth+2 {
		return tea.NewView(lipgloss.JoinVertical(lipgloss.Left, form, preview))
	}
	return tea.NewView(lipgloss.JoinHorizontal(lipgloss.Top, form, "  ", preview))
}

// Result is the choice and whether to go ahead: false when the person pressed
// ctrl+c or chose to leave an installed glowup as it is.
func (m Model) Result() (claude.Choice, bool) {
	ok := m.form.State == huh.StateCompleted && (!m.asked || *m.update)
	return *m.choice, ok
}

// Pick runs the picker on the terminal.
func Pick(in claude.Choice, installed bool) (claude.Choice, bool, error) {
	final, err := tea.NewProgram(NewModel(in, installed)).Run()
	if err != nil {
		return in, false, err
	}
	c, ok := final.(Model).Result()
	return c, ok, nil
}

package configtui

import (
	"slices"
	"strings"
	"time"

	kb "charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/colorprofile"
)

const (
	tickEvery  = 100 * time.Millisecond
	touchTicks = 20 // open is rewritten every 2 s
	answerWait = 3 * time.Second
	undoWait   = time.Second
)

type tickMsg struct{}

// stateMsg hands the model a snapshot as if the tick had read it. Only tests send it: the
// tick reads state.json inline.
type stateMsg Snapshot

// Model is the settings screen. Rows draw from snap only, so a value the session refused
// never looks applied: a key press sends a line and the row moves when state.json does.
type Model struct {
	dir           string
	snap          Snapshot
	section       int
	at            string // the id of the row under the cursor; it follows an item that moves
	editing       bool
	input         textinput.Model
	profile       colorprofile.Profile // what the terminal can show; the view sets terminal colors only with 256 or more
	seq           int
	sentAt        time.Time
	flash         string // a refusal the TUI made itself
	undoSeq       int    // non-zero once Esc sent the undo
	undoBy        time.Time
	width, height int
	ticks         int
	now           func() time.Time
}

func New(dir string, s Snapshot) Model {
	in := textinput.New()
	in.Prompt, in.CharLimit = "#", 6
	in.SetVirtualCursor(true)
	return Model{dir: dir, snap: s, seq: s.Seq, at: rowsOf(0, s)[0].id, now: time.Now, input: in}
}

func tick() tea.Cmd { return tea.Tick(tickEvery, func(time.Time) tea.Msg { return tickMsg{} }) }

func (m Model) Init() tea.Cmd { return tick() }

func (m Model) rows() ([]row, int) {
	rs := rowsOf(m.section, m.snap)
	i := slices.IndexFunc(rs, func(r row) bool { return r.id == m.at })
	return rs, max(i, 0)
}

func (m *Model) send(l Line) int {
	// the not-answering clock runs from the oldest unanswered line, so repeated presses
	// cannot keep postponing the warning
	if m.snap.Seq >= m.seq {
		m.sentAt = m.now()
	}
	m.seq++
	l.Seq = m.seq
	if err := Append(m.dir, l); err != nil {
		m.flash = "Could not write to glowup: " + err.Error()
	}
	return m.seq
}

func (m Model) undone() bool {
	return m.undoSeq > 0 && (m.snap.Seq >= m.undoSeq || !m.now().Before(m.undoBy))
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tickMsg:
		m.ticks++
		if m.ticks%touchTicks == 0 {
			_ = Touch(m.dir)
		}
		if s, ok := ReadState(m.dir); ok {
			m.snap = s
		}
		if m.undone() {
			return m, tea.Quit
		}
		return m, tick()
	case stateMsg:
		m.snap = Snapshot(msg)
		if m.undone() {
			return m, tea.Quit
		}
	case tea.PasteMsg:
		if m.editing {
			// a paste replaces the field: the input starts out holding the current color
			m.input.Reset()
			m.input.SetValue(hexDigits(msg.Content))
			m.input.CursorEnd()
		}
	case tea.KeyPressMsg:
		return m.key(msg)
	}
	return m, nil
}

func (m Model) key(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if m.undoSeq > 0 {
		return m, nil
	}
	if m.editing {
		if !kb.Matches(k, keys.Interrupt) {
			return m.editKey(k), nil
		}
		m.editing = false // then ctrl+c acts as it does outside the input
	}
	rs, i := m.rows()
	var r row
	if len(rs) == 0 {
		// a section with nothing to list (Status without fields) only lets the user leave
		if !kb.Matches(k, keys.Quit, keys.Undo, keys.Next, keys.Prev) {
			return m, nil
		}
	} else {
		r = rs[i]
	}
	m.flash = ""
	switch {
	case kb.Matches(k, keys.Quit):
		return m, tea.Quit
	case kb.Matches(k, keys.Undo):
		m.undoSeq, m.undoBy = m.send(Line{Undo: true}), m.now().Add(undoWait)
	case kb.Matches(k, keys.Up):
		m.at = rs[(i+len(rs)-1)%len(rs)].id
	case kb.Matches(k, keys.Down):
		m.at = rs[(i+1)%len(rs)].id
	case kb.Matches(k, keys.Next, keys.Prev):
		d := 1
		if kb.Matches(k, keys.Prev) {
			d = len(sections) - 1
		}
		m.section = (m.section + d) % len(sections)
		m.at = ""
		if next := rowsOf(m.section, m.snap); len(next) > 0 {
			m.at = next[0].id
		}
	case kb.Matches(k, keys.Left, keys.Right):
		d := 1
		if kb.Matches(k, keys.Left) {
			d = -1
		}
		if cmds := cycleCmds(r, m.snap, d); cmds != nil {
			m.send(Line{Cmds: cmds})
		}
	case kb.Matches(k, keys.Enter):
		if r.kind == hexRow {
			m.editing = true
			m.input.Reset()
			m.input.SetValue(strings.TrimPrefix(colorOf(m.snap, strings.TrimPrefix(r.id, "color:")), "#"))
			m.input.CursorEnd()
			m.input.Focus()
		}
	case kb.Matches(k, keys.Reset):
		if r.kind == hexRow {
			m.send(Line{Cmds: []string{"color reset " + strings.TrimPrefix(r.id, "color:")}})
		}
	case kb.Matches(k, keys.Space):
		if r.kind == item {
			if cmd, msg := toggle(r, m.snap); msg != "" {
				m.flash = msg
			} else {
				m.send(Line{Cmds: []string{cmd}})
			}
		}
	case kb.Matches(k, keys.MoveDown, keys.MoveUp):
		d := 1
		if kb.Matches(k, keys.MoveUp) {
			d = -1
		}
		if r.kind == item {
			if cmd := move(r, m.snap, d); cmd != "" {
				m.send(Line{Cmds: []string{cmd}})
			}
		}
	}
	return m, nil
}

func (m Model) editKey(k tea.KeyPressMsg) Model {
	role := strings.TrimPrefix(m.at, "color:")
	switch {
	case kb.Matches(k, keys.Cancel):
		m.editing = false
	case kb.Matches(k, keys.Set):
		m.editing = false
		if v := strings.ToLower(m.input.Value()); v == "" {
			m.send(Line{Cmds: []string{"color reset " + role}})
		} else {
			m.send(Line{Cmds: []string{"color " + role + " #" + v}})
		}
	case k.Text != "" && hexDigits(k.Text) != k.Text:
		// not a hex digit: the input never sees it
	default:
		m.input, _ = m.input.Update(k)
	}
	return m
}

// hexDigits is s without anything that is not a hex digit.
func hexDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune("0123456789abcdefABCDEF", r) {
			return r
		}
		return -1
	}, s)
}

// status is the footer's message line: the TUI's own refusal, then a session that stopped
// answering, then the session's error note.
func (m Model) status() string {
	switch {
	case m.flash != "":
		return m.flash
	case m.snap.Seq < m.seq && m.now().Sub(m.sentAt) > answerWait:
		return "glowup is not answering. Is the Claude session still open?"
	case m.snap.Note != nil && m.snap.Note.Tone == "error":
		return m.snap.Note.Text
	}
	return ""
}

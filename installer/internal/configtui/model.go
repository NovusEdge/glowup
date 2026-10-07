package configtui

import (
	"slices"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

const (
	tickEvery  = 100 * time.Millisecond
	touchTicks = 20 // open is rewritten every 2 s
	answerWait = 3 * time.Second
	undoWait   = time.Second
)

type tickMsg struct{}

// stateMsg carries a state.json read; the tick sends it, tests send it directly.
type stateMsg Snapshot

// Model is the settings screen. Rows draw from snap only, so a value the session refused
// never looks applied: a key press sends a line and the row moves when state.json does.
type Model struct {
	dir           string
	snap          Snapshot
	section       int
	at            string // the id of the row under the cursor; it follows an item that moves
	editing       bool
	buf           string
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
	return Model{dir: dir, snap: s, seq: s.Seq, at: rowsOf(0, s)[0].id, now: time.Now}
}

func tick() tea.Cmd { return tea.Tick(tickEvery, func(time.Time) tea.Msg { return tickMsg{} }) }

func (m Model) Init() tea.Cmd { return tick() }

func (m Model) rows() ([]row, int) {
	rs := rowsOf(m.section, m.snap)
	i := slices.IndexFunc(rs, func(r row) bool { return r.id == m.at })
	return rs, max(i, 0)
}

func (m *Model) send(l Line) int {
	m.seq++
	l.Seq = m.seq
	if err := Append(m.dir, l); err != nil {
		m.flash = "Could not write to glowup: " + err.Error()
	}
	m.sentAt = m.now()
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
		return m.editKey(k), nil
	}
	rs, i := m.rows()
	r := rs[i]
	m.flash = ""
	switch k.String() {
	case "q":
		return m, tea.Quit
	case "esc", "ctrl+c":
		m.undoSeq, m.undoBy = m.send(Line{Undo: true}), m.now().Add(undoWait)
	case "up", "k":
		m.at = rs[(i+len(rs)-1)%len(rs)].id
	case "down", "j":
		m.at = rs[(i+1)%len(rs)].id
	case "tab", "shift+tab":
		d := 1
		if k.String() == "shift+tab" {
			d = len(sections) - 1
		}
		m.section = (m.section + d) % len(sections)
		m.at = rowsOf(m.section, m.snap)[0].id
	case "left", "h", "right", "l":
		d := 1
		if k.String() == "left" || k.String() == "h" {
			d = -1
		}
		if cmds := cycleCmds(r, m.snap, d); cmds != nil {
			m.send(Line{Cmds: cmds})
		}
	case "enter":
		if r.kind == hexRow {
			m.editing, m.buf = true, strings.TrimPrefix(colorOf(m.snap, strings.TrimPrefix(r.id, "color:")), "#")
		}
	case "r":
		if r.kind == hexRow {
			m.send(Line{Cmds: []string{"color reset " + strings.TrimPrefix(r.id, "color:")}})
		}
	case "space":
		if r.kind == item {
			if cmd, msg := toggle(r, m.snap); msg != "" {
				m.flash = msg
			} else {
				m.send(Line{Cmds: []string{cmd}})
			}
		}
	case "J", "K", "shift+j", "shift+k":
		d := 1
		if strings.HasSuffix(strings.ToLower(k.String()), "k") {
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
	switch k.String() {
	case "esc":
		m.editing = false
	case "enter":
		m.editing = false
		if m.buf == "" {
			m.send(Line{Cmds: []string{"color reset " + role}})
		} else {
			m.send(Line{Cmds: []string{"color " + role + " #" + m.buf}})
		}
	case "backspace":
		if m.buf != "" {
			m.buf = m.buf[:len(m.buf)-1]
		}
	default:
		if len(k.Text) == 1 && strings.Contains("0123456789abcdefABCDEF", k.Text) && len(m.buf) < 6 {
			m.buf += strings.ToLower(k.Text)
		}
	}
	return m
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

func (m Model) View() tea.View { return tea.NewView("") }

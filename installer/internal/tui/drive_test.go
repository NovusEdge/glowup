package tui

import (
	"time"

	tea "charm.land/bubbletea/v2"
)

// send feeds msg to m and then runs the commands it returns, feeding their
// messages back, the way a tea.Program would. huh moves between fields and
// groups through such commands, so a bare Update never advances the form.
// A command that has not answered in 50ms is a timer (cursor blink) and is dropped.
func send(m Model, msg tea.Msg) Model {
	next, cmd := m.Update(msg)
	return run(next.(Model), cmd, 0)
}

func run(m Model, cmd tea.Cmd, depth int) Model {
	if cmd == nil || depth > 50 {
		return m
	}
	ch := make(chan tea.Msg, 1)
	go func() { ch <- cmd() }()
	select {
	case msg := <-ch:
		switch msg := msg.(type) {
		case nil, tea.QuitMsg:
			return m
		case tea.BatchMsg:
			for _, c := range msg {
				m = run(m, c, depth+1)
			}
			return m
		default:
			next, cmd := m.Update(msg)
			return run(next.(Model), cmd, depth+1)
		}
	case <-time.After(50 * time.Millisecond):
		return m
	}
}

func start(m Model) Model { return run(m, m.Init(), 0) }

func enter(m Model) Model { return send(m, tea.KeyPressMsg{Code: tea.KeyEnter}) }

package configtui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
)

func newModel(t *testing.T) (Model, string) {
	t.Helper()
	dir := t.TempDir()
	m := New(dir, snap())
	m.width, m.height = 120, 40
	return m, dir
}

func press(m Model, k tea.KeyPressMsg) (Model, tea.Cmd) {
	next, cmd := m.Update(k)
	return next.(Model), cmd
}

func key(s string) tea.KeyPressMsg {
	switch s {
	case "esc":
		return tea.KeyPressMsg{Code: tea.KeyEscape}
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	case "right":
		return tea.KeyPressMsg{Code: tea.KeyRight}
	case "down":
		return tea.KeyPressMsg{Code: tea.KeyDown}
	case "tab":
		return tea.KeyPressMsg{Code: tea.KeyTab}
	case "space":
		return tea.KeyPressMsg{Code: tea.KeySpace, Text: " "}
	case "backspace":
		return tea.KeyPressMsg{Code: tea.KeyBackspace}
	}
	return tea.KeyPressMsg{Code: rune(s[0]), Text: s}
}

func lines(t *testing.T, dir string) []string {
	t.Helper()
	b, _ := os.ReadFile(filepath.Join(dir, "commands.jsonl"))
	return strings.Split(strings.TrimSuffix(string(b), "\n"), "\n")
}

func TestRightOnPackSendsTheNextPackButTheRowWaitsForState(t *testing.T) {
	m, dir := newModel(t)
	m, _ = press(m, key("right"))
	if got := lines(t, dir); len(got) != 1 || got[0] != `{"seq":1,"cmds":["pack crt"]}` {
		t.Fatal(got)
	}
	if v := value(rowsOf(0, m.snap)[0], m.snap); v != "classic" {
		t.Fatal("the row moved before the session answered:", v)
	}
	s := snap()
	s.Seq, s.State.Mix = 1, Mix{Colors: "crt", Motion: "crt"}
	next, _ := m.Update(stateMsg(s))
	m = next.(Model)
	if v := value(rowsOf(0, m.snap)[0], m.snap); v != "crt" {
		t.Fatal(v)
	}
}

func TestQQuitsWithoutUndo(t *testing.T) {
	m, dir := newModel(t)
	_, cmd := press(m, key("q"))
	if cmd == nil {
		t.Fatal("q did not quit")
	}
	if _, err := os.Stat(filepath.Join(dir, "commands.jsonl")); err == nil {
		t.Fatal("q wrote a line")
	}
}

func TestEscSendsUndoAndQuitsWhenTheSessionAnswers(t *testing.T) {
	m, dir := newModel(t)
	m, _ = press(m, key("right"))
	m, cmd := press(m, key("esc"))
	if cmd != nil {
		t.Fatal("quit before the undo was applied")
	}
	if got := lines(t, dir); got[len(got)-1] != `{"seq":2,"undo":true}` {
		t.Fatal(got)
	}
	s := snap()
	s.Seq = 2
	_, cmd = m.Update(stateMsg(s))
	if cmd == nil {
		t.Fatal("did not quit once the undo came back")
	}
}

func TestEscQuitsAfterASecondWhenNobodyAnswers(t *testing.T) {
	m, _ := newModel(t)
	now := time.Unix(100, 0)
	m.now = func() time.Time { return now }
	m, _ = press(m, key("esc"))
	now = now.Add(1100 * time.Millisecond)
	_, cmd := m.Update(tickMsg{})
	if cmd == nil {
		t.Fatal("still waiting after the undo deadline")
	}
}

func TestHexInputEnterSendsEscCancels(t *testing.T) {
	m, dir := newModel(t)
	m, _ = press(m, key("tab"))
	m, _ = press(m, key("enter"))
	for range 6 {
		m, _ = press(m, key("backspace"))
	}
	for _, c := range "112233" {
		m, _ = press(m, key(string(c)))
	}
	m, _ = press(m, key("enter"))
	if got := lines(t, dir); got[0] != `{"seq":1,"cmds":["color accent #112233"]}` {
		t.Fatal(got)
	}
	m, _ = press(m, key("enter"))
	m, _ = press(m, key("a"))
	m, cmd := press(m, key("esc"))
	if cmd != nil || len(lines(t, dir)) != 1 || m.editing {
		t.Fatal("Esc in the hex input must only close it")
	}
}

func TestRResetsAColor(t *testing.T) {
	m, dir := newModel(t)
	m, _ = press(m, key("tab"))
	press(m, key("r"))
	if got := lines(t, dir); got[0] != `{"seq":1,"cmds":["color reset accent"]}` {
		t.Fatal(got)
	}
}

func TestSpaceOnTheLastStatusFieldIsRefusedOnScreen(t *testing.T) {
	m, dir := newModel(t)
	m.snap.State.Fields = []string{"ctx"}
	for range 4 {
		m, _ = press(m, key("tab"))
	}
	m, _ = press(m, key("space"))
	if m.flash != "Keep at least one." {
		t.Fatal(m.flash)
	}
	if _, err := os.Stat(filepath.Join(dir, "commands.jsonl")); err == nil {
		t.Fatal("wrote a line")
	}
}

func TestShiftKMovesAFieldAndTheCursorFollowsIt(t *testing.T) {
	m, dir := newModel(t)
	for range 4 {
		m, _ = press(m, key("tab"))
	}
	m, _ = press(m, key("down"))
	m, _ = press(m, key("K"))
	if got := lines(t, dir); got[0] != `{"seq":1,"cmds":["statusline fields cost ctx"]}` {
		t.Fatal(got)
	}
	s := snap()
	s.Seq, s.State.Fields = 1, []string{"cost", "ctx"}
	next, _ := m.Update(stateMsg(s))
	if next.(Model).at != "fields:cost" {
		t.Fatal(next.(Model).at)
	}
}

func TestNotAnsweringAfterThreeSeconds(t *testing.T) {
	m, _ := newModel(t)
	now := time.Unix(100, 0)
	m.now = func() time.Time { return now }
	m, _ = press(m, key("right"))
	if m.status() != "" {
		t.Fatal(m.status())
	}
	now = now.Add(3100 * time.Millisecond)
	if m.status() != "glowup is not answering. Is the Claude session still open?" {
		t.Fatal(m.status())
	}
}

func TestANoteFromTheSessionShowsWhenItIsAnError(t *testing.T) {
	m, _ := newModel(t)
	m.snap.Note = &Note{Text: "meter.warn must be below meter.danger", Tone: "error"}
	if m.status() != "meter.warn must be below meter.danger" {
		t.Fatal(m.status())
	}
	m.snap.Note.Tone = "ok"
	if m.status() != "" {
		t.Fatal(m.status())
	}
}

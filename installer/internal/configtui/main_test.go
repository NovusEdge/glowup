package configtui

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestMainNeedsARunDir(t *testing.T) {
	var out, errb bytes.Buffer
	if code := Main(nil, &out, &errb); code != 2 || !strings.Contains(errb.String(), "--run") {
		t.Fatal(code, errb.String())
	}
}

func TestMainRefusesASecondTUIOnAFreshRun(t *testing.T) {
	var out, errb bytes.Buffer
	dir := t.TempDir()
	b, _ := json.Marshal(snap())
	os.WriteFile(filepath.Join(dir, "state.json"), b, 0o600)
	os.WriteFile(filepath.Join(dir, "open"), nil, 0o600)
	before, _ := os.Stat(filepath.Join(dir, "open"))
	if code := Main([]string{"--run", dir}, &out, &errb); code != 1 || errb.String() != "glowup config is already open.\n" {
		t.Fatal(code, errb.String())
	}
	if after, _ := os.Stat(filepath.Join(dir, "open")); !after.ModTime().Equal(before.ModTime()) {
		t.Fatal("the refused TUI rewrote open")
	}
}

func TestMainRemovesOpenWhenTheUserQuits(t *testing.T) {
	var out, errb bytes.Buffer
	dir := t.TempDir()
	b, _ := json.Marshal(snap())
	os.WriteFile(filepath.Join(dir, "state.json"), b, 0o600)
	programOptions = []tea.ProgramOption{tea.WithInput(strings.NewReader("q")), tea.WithOutput(io.Discard)}
	t.Cleanup(func() { programOptions = nil })
	if code := Main([]string{"--run", dir}, &out, &errb); code != 0 {
		t.Fatal(code, errb.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "open")); !os.IsNotExist(err) {
		t.Fatal("open is still there after the TUI quit:", err)
	}
}

func TestMainRefusesADirWithNoState(t *testing.T) {
	var out, errb bytes.Buffer
	dir := t.TempDir()
	if code := Main([]string{"--run", dir}, &out, &errb); code != 1 || !strings.Contains(errb.String(), "Run /glowup config in Claude Code") {
		t.Fatal(code, errb.String())
	}
}

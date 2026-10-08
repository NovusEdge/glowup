//go:build unix

package configtui

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
)

func TestMainRemovesOpenAndExitsCleanlyOnSIGHUP(t *testing.T) {
	var out, errb bytes.Buffer
	dir := t.TempDir()
	b, _ := json.Marshal(snap())
	os.WriteFile(filepath.Join(dir, "state.json"), b, 0o600)
	in, w := io.Pipe()
	t.Cleanup(func() { w.Close() })
	programOptions = []tea.ProgramOption{tea.WithInput(in), tea.WithOutput(io.Discard)}
	t.Cleanup(func() { programOptions = nil })
	done := make(chan int)
	go func() { done <- Main([]string{"--run", dir}, &out, &errb) }()
	open := filepath.Join(dir, "open")
	for deadline := time.Now().Add(5 * time.Second); ; time.Sleep(10 * time.Millisecond) {
		if _, err := os.Stat(open); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("open never appeared")
		}
	}
	syscall.Kill(os.Getpid(), syscall.SIGHUP)
	select {
	case code := <-done:
		if code != 0 {
			t.Fatal(code, errb.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Main did not return after SIGHUP")
	}
	if _, err := os.Stat(open); !os.IsNotExist(err) {
		t.Fatal("open is still there after SIGHUP:", err)
	}
}

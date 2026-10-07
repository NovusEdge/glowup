// Package configtui is glowup's settings screen. It runs in its own terminal, bound to one
// Claude Code session through a run directory the mod created (hooks/remote.ts): it appends
// /glowup commands to commands.jsonl and draws what the session writes back to state.json.
package configtui

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"regexp"

	"github.com/novusedge/glowup/installer/internal/packs"
)

type Note struct {
	Text string `json:"text"`
	Tone string `json:"tone"`
}

type Mix struct {
	Colors    string            `json:"colors"`
	Motion    string            `json:"motion"`
	Theme     string            `json:"theme,omitempty"`
	Spinner   string            `json:"spinner,omitempty"`
	Overrides map[string]string `json:"overrides,omitempty"`
}

type Setup struct {
	Band  []string `json:"band"`
	Tabs  []string `json:"tabs"`
	Meter struct {
		Warn   int `json:"warn"`
		Danger int `json:"danger"`
	} `json:"meter"`
	Bubbles struct {
		Moods []string `json:"moods"`
		Ms    int      `json:"ms"`
	} `json:"bubbles"`
	Pet struct {
		SleepMs int `json:"sleepMs"`
	} `json:"pet"`
}

type State struct {
	Mix     Mix          `json:"mix"`
	Colors  packs.Colors `json:"colors"`
	Pet     string       `json:"pet"`
	Bubbles string       `json:"bubbles"`
	Reduced bool         `json:"reduced"`
	Setup   Setup        `json:"setup"`
	Fields  []string     `json:"fields"`
}

type LookInfo struct {
	Name        string `json:"name"`
	Bg          string `json:"bg"`
	Border      string `json:"border"`
	BorderColor string `json:"borderColor"`
	Spinner     string `json:"spinner"`
	SpinColor   string `json:"spinColor"`
	Word        string `json:"word"`
}

type Options struct {
	Packs    []string `json:"packs"`
	Spinners []string `json:"spinners"`
	Pets     []string `json:"pets"`
	Fields   []string `json:"fields"`
	Band     []string `json:"band"`
	Tabs     []string `json:"tabs"`
	Moods    []string `json:"moods"`
	Bubbles  []string `json:"bubbles"`
}

// Snapshot is state.json: what the session shows after the line numbered Seq.
type Snapshot struct {
	Format  int      `json:"format"`
	Seq     int      `json:"seq"`
	Lines   int      `json:"lines"`
	Version string   `json:"version"`
	Cwd     string   `json:"cwd"`
	Note    *Note    `json:"note,omitempty"`
	State   State    `json:"state"`
	Look    LookInfo `json:"look"`
	Options Options  `json:"options"`
}

// Line is one line of commands.jsonl.
type Line struct {
	Seq  int      `json:"seq"`
	Cmds []string `json:"cmds,omitempty"`
	Undo bool     `json:"undo,omitempty"`
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// validColors is false when the preview would index into a color that is not #rrggbb
// (tui.rgb panics). The look's own colors may be empty: lookOf falls back to the palette.
func (s Snapshot) validColors() bool {
	c := reflect.ValueOf(s.State.Colors)
	for i := range c.NumField() {
		if !hexColor.MatchString(c.Field(i).String()) {
			return false
		}
	}
	for _, h := range []string{s.Look.Bg, s.Look.BorderColor, s.Look.SpinColor} {
		if h != "" && !hexColor.MatchString(h) {
			return false
		}
	}
	return true
}

// ReadState reads state.json. The engine cannot rename, so the mod writes it in place: a
// read that lands mid-write fails to parse and is ignored until the next good one. A file
// that parses but lacks the 14 colors is treated the same way.
func ReadState(dir string) (Snapshot, bool) {
	b, err := os.ReadFile(filepath.Join(dir, "state.json"))
	if err != nil {
		return Snapshot{}, false
	}
	var s Snapshot
	if json.Unmarshal(b, &s) != nil || s.Format != 1 || !s.validColors() {
		return Snapshot{}, false
	}
	return s, true
}

// Append adds l to commands.jsonl in one write. The mod reads only lines that end in a
// newline, so a line is never seen half-written.
func Append(dir string, l Line) error {
	b, err := json.Marshal(l)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(dir, "commands.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, err = f.Write(append(b, '\n'))
	return errors.Join(err, f.Close())
}

// Touch rewrites open. Its mtime is the heartbeat: the mod stops polling the run once it
// is 10 s old.
func Touch(dir string) error {
	tmp := filepath.Join(dir, "open.tmp")
	if err := os.WriteFile(tmp, nil, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, "open"))
}

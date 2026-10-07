package configtui

import (
	"bytes"
	"strings"
	"testing"
)

func TestMainNeedsARunDir(t *testing.T) {
	var out, errb bytes.Buffer
	if code := Main(nil, &out, &errb); code != 2 || !strings.Contains(errb.String(), "--run") {
		t.Fatal(code, errb.String())
	}
}

func TestMainRefusesADirWithNoState(t *testing.T) {
	var out, errb bytes.Buffer
	dir := t.TempDir()
	if code := Main([]string{"--run", dir}, &out, &errb); code != 1 || !strings.Contains(errb.String(), "Run /glowup config in Claude Code") {
		t.Fatal(code, errb.String())
	}
}

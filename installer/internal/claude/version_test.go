package claude

import (
	"context"
	"errors"
	"testing"
)

func TestParseVersion(t *testing.T) {
	for in, want := range map[string]Version{
		"2.1.289 (Claude Code)\n":      {2, 1, 289},
		"v2.2.0":                       {2, 2, 0},
		"2.1.300-beta.1 (Claude Code)": {2, 1, 300},
	} {
		got, err := ParseVersion(in)
		if err != nil || got != want {
			t.Errorf("ParseVersion(%q) = %v, %v; want %v", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "Claude Code", "2.1", "2.x.1"} {
		if _, err := ParseVersion(bad); err == nil {
			t.Errorf("ParseVersion(%q) accepted", bad)
		}
	}
}

func TestVersionLess(t *testing.T) {
	if !(Version{2, 1, 288}).Less(Version{2, 1, 289}) || (Version{2, 1, 289}).Less(Version{2, 1, 289}) || (Version{3, 0, 0}).Less(Version{2, 9, 9}) {
		t.Fatal("Less is wrong")
	}
}

func TestCheckVersion(t *testing.T) {
	ctx := context.Background()
	ok := &fakeRunner{answers: map[string]Result{"claude --version": {Stdout: "2.1.289 (Claude Code)\n"}}}
	if v, err := CheckVersion(ctx, ok); err != nil || v != (Version{2, 1, 289}) {
		t.Fatalf("at the floor: %v, %v", v, err)
	}

	old := &fakeRunner{answers: map[string]Result{"claude --version": {Stdout: "2.1.200 (Claude Code)\n"}}}
	var tooOld *TooOldError
	if _, err := CheckVersion(ctx, old); !errors.As(err, &tooOld) || tooOld.Have != (Version{2, 1, 200}) {
		t.Fatalf("old: err = %v", err)
	}

	if _, err := CheckVersion(ctx, &fakeRunner{}); !errors.Is(err, ErrNotInstalled) {
		t.Fatalf("missing: err = %v", err)
	}

	broken := &fakeRunner{answers: map[string]Result{"claude --version": {Code: 1, Stderr: "boom\n"}}}
	if _, err := CheckVersion(ctx, broken); err == nil {
		t.Fatal("non-zero exit accepted")
	}
}

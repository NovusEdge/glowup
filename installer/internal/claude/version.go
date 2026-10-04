package claude

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// MinVersion is the oldest Claude Code this installer supports. 2.1.289 is the
// release the mod's CI pins (.github/workflows/ci.yml) and the one where
// `plugin install --config` and `plugin configure --values-stdin` were checked;
// older builds may have them, but nobody has verified that.
const MinVersion = "2.1.289"

// Version is major.minor.patch. A pre-release suffix is dropped when parsing.
type Version [3]int

func (v Version) String() string { return fmt.Sprintf("%d.%d.%d", v[0], v[1], v[2]) }

// Less reports whether v is older than o.
func (v Version) Less(o Version) bool {
	for i := range v {
		if v[i] != o[i] {
			return v[i] < o[i]
		}
	}
	return false
}

// ParseVersion reads the first field of `claude --version` output, such as "2.1.289 (Claude Code)".
func ParseVersion(s string) (Version, error) {
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return Version{}, fmt.Errorf("empty version")
	}
	core, _, _ := strings.Cut(strings.TrimPrefix(fields[0], "v"), "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return Version{}, fmt.Errorf("version %q is not major.minor.patch", fields[0])
	}
	var v Version
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return Version{}, fmt.Errorf("version %q is not major.minor.patch", fields[0])
		}
		v[i] = n
	}
	return v, nil
}

// ErrNotInstalled means `claude` is not on PATH.
var ErrNotInstalled = errors.New("claude is not on PATH")

// TooOldError means the installed Claude Code is older than MinVersion.
type TooOldError struct{ Have Version }

func (e *TooOldError) Error() string {
	return fmt.Sprintf("Claude Code %s is older than %s", e.Have, MinVersion)
}

// CheckVersion runs `claude --version` and compares it with MinVersion.
func CheckVersion(ctx context.Context, r Runner) (Version, error) {
	res, err := r.Run(ctx, "", "claude", "--version")
	if errors.Is(err, exec.ErrNotFound) {
		return Version{}, ErrNotInstalled
	}
	if err != nil {
		return Version{}, err
	}
	if res.Code != 0 {
		return Version{}, fmt.Errorf("claude --version exited %d: %s", res.Code, lastLine(res.Stderr))
	}
	have, err := ParseVersion(res.Stdout)
	if err != nil {
		return Version{}, err
	}
	min, _ := ParseVersion(MinVersion)
	if have.Less(min) {
		return have, &TooOldError{Have: have}
	}
	return have, nil
}

// lastLine is the last non-blank line of s, trimmed: the line a CLI puts its verdict on.
func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

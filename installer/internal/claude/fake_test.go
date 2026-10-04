package claude

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// fakeRunner answers argv strings from a table and records every call.
// An argv missing from the table behaves like a binary that is not installed.
type fakeRunner struct {
	answers map[string]Result
	calls   []string
	stdins  []string
}

func (f *fakeRunner) Run(_ context.Context, stdin string, argv ...string) (Result, error) {
	key := strings.Join(argv, " ")
	f.calls = append(f.calls, key)
	f.stdins = append(f.stdins, stdin)
	res, ok := f.answers[key]
	if !ok {
		return Result{}, fmt.Errorf("%s: %w", argv[0], exec.ErrNotFound)
	}
	return res, nil
}

package claude

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"strings"
)

// Result is a finished command. Code is its exit status.
type Result struct {
	Stdout string
	Stderr string
	Code   int
}

// Runner runs one command. A non-zero exit is a Result, not an error; the error
// is for a command that could not start, and wraps exec.ErrNotFound when the
// binary is not on PATH. Tests pass a fake so nothing reaches the real claude.
type Runner interface {
	Run(ctx context.Context, stdin string, argv ...string) (Result, error)
}

// ExecRunner runs commands with os/exec.
type ExecRunner struct{}

func (ExecRunner) Run(ctx context.Context, stdin string, argv ...string) (Result, error) {
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	// Without stdin claude reads /dev/null and never waits on a prompt the picker is drawing over.
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	res := Result{Stdout: out.String(), Stderr: errb.String()}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		res.Code = exit.ExitCode()
		return res, nil
	}
	return res, err
}

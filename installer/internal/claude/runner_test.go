package claude

import (
	"context"
	"errors"
	"os/exec"
	"testing"
)

func TestExecRunnerCapturesOutputAndExitCode(t *testing.T) {
	res, err := ExecRunner{}.Run(context.Background(), "in", "sh", "-c", `cat; printf err >&2; exit 3`)
	if err != nil {
		t.Fatal(err)
	}
	if res != (Result{Stdout: "in", Stderr: "err", Code: 3}) {
		t.Fatalf("got %+v", res)
	}
}

func TestExecRunnerMissingBinary(t *testing.T) {
	_, err := ExecRunner{}.Run(context.Background(), "", "glowup-no-such-binary-x7")
	if !errors.Is(err, exec.ErrNotFound) {
		t.Fatalf("err = %v, want exec.ErrNotFound", err)
	}
}

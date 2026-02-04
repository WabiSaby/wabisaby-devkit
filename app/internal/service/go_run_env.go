package service

import (
	"os"
	"strings"
)

// envForGoRun returns an environment for "go run" that uses GOTOOLCHAIN=auto
// so each project's go.mod toolchain requirement is respected (e.g. go 1.24.4).
func envForGoRun() []string {
	const prefix = "GOTOOLCHAIN="
	var out []string
	for _, e := range os.Environ() {
		if strings.HasPrefix(e, prefix) {
			continue
		}
		out = append(out, e)
	}
	return append(out, prefix+"auto")
}

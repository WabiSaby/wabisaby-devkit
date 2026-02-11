//go:build windows

package service

import (
	"log"
	"os/exec"
)

// setSysProcAttr is a no-op on Windows (no process groups via Setpgid).
func setSysProcAttr(cmd *exec.Cmd) {
	// On Windows, Setpgid is not available. Process management is handled
	// differently (e.g. Job Objects). For now, we skip process group setup.
}

// terminateProcess kills the process on Windows.
func terminateProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	// Windows doesn't have SIGTERM; Kill() is the only reliable option.
	if err := cmd.Process.Kill(); err != nil {
		log.Printf("Failed to kill process %d: %v", cmd.Process.Pid, err)
	}
}

// forceKillProcess force-kills the process on Windows.
func forceKillProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	if err := cmd.Process.Kill(); err != nil {
		log.Printf("Failed to force-kill process %d: %v", cmd.Process.Pid, err)
	}
}

// killPidByPort is a no-op on Windows (TODO: implement via taskkill).
func killPidByPort(pidStr string, port int) {
	// TODO: implement for Windows (netstat -ano, taskkill)
}

//go:build !windows

package service

import (
	"log"
	"os/exec"
	"strconv"
	"syscall"
)

// setSysProcAttr configures the command to run in its own process group (Unix).
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}

// terminateProcess sends SIGTERM to the process group (Unix).
func terminateProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err == nil {
		syscall.Kill(-pgid, syscall.SIGTERM)
	} else {
		cmd.Process.Signal(syscall.SIGTERM)
	}
}

// forceKillProcess sends SIGKILL to the process group (Unix).
func forceKillProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err == nil {
		syscall.Kill(-pgid, syscall.SIGKILL)
	} else {
		cmd.Process.Kill()
	}
}

// killPidByPort sends SIGTERM to a PID found on a port (Unix).
func killPidByPort(pidStr string, port int) {
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		log.Printf("Failed to kill PID %d on port %d: %v", pid, port, err)
	}
}

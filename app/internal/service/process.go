package service

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/wabisaby/devkit-dashboard/internal/config"
)

// ProcessState represents the state of a managed process
type ProcessState string

const (
	ProcessStopped  ProcessState = "stopped"
	ProcessStarting ProcessState = "starting"
	ProcessRunning  ProcessState = "running"
	ProcessStopping ProcessState = "stopping"
	ProcessError    ProcessState = "error"
)

const maxLastOutputLines = 50

// ManagedProcess represents a running service process
type ManagedProcess struct {
	Name      string
	State     ProcessState
	PID       int
	Cmd       *exec.Cmd
	StartTime time.Time
	Error     error

	// Log streaming
	logMu         sync.RWMutex
	subscribers    map[chan string]struct{}
	done           chan struct{}
	lastOutput     []string // last N lines of stdout/stderr for failed services
	onActivityLine func(line string) // optional; called for each line for Activity feed
}

// BackendExitCallback is called when a backend process exits (optional, for Activity feed).
type BackendExitCallback func(serviceName string, err error, lastOutput []string)

// ActivityLineCallback is called for each stdout/stderr line from a backend (optional, for Activity feed).
type ActivityLineCallback func(serviceName string, line string)

// ProcessManager tracks running Go processes
type ProcessManager struct {
	mu           sync.RWMutex
	processes    map[string]*ManagedProcess
	wabisabyRoot string
	onExit       BackendExitCallback
	onActivityLine ActivityLineCallback
}

// SetOnExit sets a callback invoked when a backend service process exits (e.g. to emit to Activity).
func (pm *ProcessManager) SetOnExit(cb BackendExitCallback) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.onExit = cb
}

// SetOnActivityLine sets a callback invoked for each stdout/stderr line from any backend (e.g. to emit to Activity).
func (pm *ProcessManager) SetOnActivityLine(cb ActivityLineCallback) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.onActivityLine = cb
}

// NewProcessManager creates a new process manager
func NewProcessManager(wabisabyRoot string) *ProcessManager {
	return &ProcessManager{
		processes:    make(map[string]*ManagedProcess),
		wabisabyRoot: wabisabyRoot,
	}
}

// Start starts a WabiSaby-Go service
func (pm *ProcessManager) Start(serviceName string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// Check if already running
	if proc, exists := pm.processes[serviceName]; exists && proc.State == ProcessRunning {
		return fmt.Errorf("service %s is already running", serviceName)
	}

	// Get service config
	svcConfig := config.GetServiceByName(serviceName)
	if svcConfig == nil {
		return fmt.Errorf("unknown service: %s", serviceName)
	}

	// Load .env file
	envVars, err := pm.loadEnvFile()
	if err != nil {
		log.Printf("Warning: failed to load .env file: %v", err)
		// Continue without .env - some vars might be set in environment
	}

	// Create command
	cmd := exec.Command("go", "run", svcConfig.CmdPath)
	cmd.Dir = pm.wabisabyRoot
	// Use GOTOOLCHAIN=auto so the project's go.mod toolchain requirement is respected (e.g. 1.24.4)
	cmd.Env = append(envForGoRun(), envVars...)

	// Set up process group for clean termination
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	// Set up pipes for log capture
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Create managed process
	proc := &ManagedProcess{
		Name:        serviceName,
		State:       ProcessStarting,
		Cmd:         cmd,
		subscribers: make(map[chan string]struct{}),
		done:        make(chan struct{}),
	}
	if pm.onActivityLine != nil {
		cb := pm.onActivityLine
		name := serviceName
		proc.onActivityLine = func(line string) { cb(name, line) }
	}

	// Start process
	if err := cmd.Start(); err != nil {
		proc.State = ProcessError
		proc.Error = err
		return fmt.Errorf("failed to start process: %w", err)
	}

	proc.PID = cmd.Process.Pid
	proc.StartTime = time.Now()

	// Start log capture goroutines
	go proc.captureOutput(stdout, "")
	go proc.captureOutput(stderr, "[stderr] ")

	// Monitor process
	go func() {
		err := cmd.Wait()
		pm.mu.Lock()

		close(proc.done)

		if err != nil {
			proc.State = ProcessError
			proc.Error = err
			log.Printf("Service %s exited with error: %v", serviceName, err)
		} else {
			proc.State = ProcessStopped
			log.Printf("Service %s stopped", serviceName)
		}

		// Notify subscribers that logs are done
		proc.broadcast("[Process exited]")
		
		// Copy lastOutput and invoke exit callback for Activity (must not hold logMu long)
		var exitOutput []string
		proc.logMu.RLock()
		if len(proc.lastOutput) > 0 {
			exitOutput = make([]string, len(proc.lastOutput))
			copy(exitOutput, proc.lastOutput)
		}
		proc.logMu.RUnlock()
		cb := pm.onExit
		pm.mu.Unlock()

		if cb != nil {
			cb(serviceName, err, exitOutput)
		}
	}()

	// Wait briefly to detect immediate failures
	time.Sleep(500 * time.Millisecond)

	pm.mu.Unlock()
	pm.mu.Lock()

	if proc.State == ProcessError {
		return proc.Error
	}

	proc.State = ProcessRunning
	pm.processes[serviceName] = proc
	log.Printf("Started service %s (PID: %d)", serviceName, proc.PID)

	return nil
}

// Stop stops a WabiSaby-Go service
func (pm *ProcessManager) Stop(serviceName string) error {
	pm.mu.Lock()
	proc, exists := pm.processes[serviceName]
	if !exists || (proc.State != ProcessRunning && proc.State != ProcessStarting) {
		pm.mu.Unlock()
		return nil
	}
	proc.State = ProcessStopping
	pm.mu.Unlock()

	// Send SIGTERM to process group
	if proc.Cmd.Process != nil {
		pgid, err := syscall.Getpgid(proc.Cmd.Process.Pid)
		if err == nil {
			syscall.Kill(-pgid, syscall.SIGTERM)
		} else {
			proc.Cmd.Process.Signal(syscall.SIGTERM)
		}
	}

	// Wait with timeout
	select {
	case <-proc.done:
		// Clean exit
	case <-time.After(10 * time.Second):
		// Force kill
		if proc.Cmd.Process != nil {
			pgid, err := syscall.Getpgid(proc.Cmd.Process.Pid)
			if err == nil {
				syscall.Kill(-pgid, syscall.SIGKILL)
			} else {
				proc.Cmd.Process.Kill()
			}
		}
		<-proc.done
	}

	pm.mu.Lock()
	proc.State = ProcessStopped
	pm.mu.Unlock()

	log.Printf("Stopped service %s", serviceName)
	return nil
}

// StopAll stops all running services
func (pm *ProcessManager) StopAll() error {
	pm.mu.RLock()
	names := make([]string, 0, len(pm.processes))
	for name, proc := range pm.processes {
		if proc.State == ProcessRunning || proc.State == ProcessStarting {
			names = append(names, name)
		}
	}
	pm.mu.RUnlock()

	var wg sync.WaitGroup
	for _, name := range names {
		wg.Add(1)
		go func(n string) {
			defer wg.Done()
			pm.Stop(n)
		}(name)
	}
	wg.Wait()

	return nil
}

// GetStatus returns the status of a service
func (pm *ProcessManager) GetStatus(serviceName string) string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	proc, exists := pm.processes[serviceName]
	if !exists {
		return string(ProcessStopped)
	}
	return string(proc.State)
}

// GetPID returns the PID of a running service
func (pm *ProcessManager) GetPID(serviceName string) int {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	proc, exists := pm.processes[serviceName]
	if !exists || proc.State != ProcessRunning {
		return 0
	}
	return proc.PID
}

// GetError returns the error for a service in error state
func (pm *ProcessManager) GetError(serviceName string) string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	proc, exists := pm.processes[serviceName]
	if !exists || proc.Error == nil {
		return ""
	}
	return proc.Error.Error()
}

// GetLastOutput returns the last N lines of stdout/stderr for a service (e.g. to show why it failed)
func (pm *ProcessManager) GetLastOutput(serviceName string) []string {
	pm.mu.RLock()
	proc, exists := pm.processes[serviceName]
	pm.mu.RUnlock()
	if !exists {
		return nil
	}
	proc.logMu.RLock()
	defer proc.logMu.RUnlock()
	if len(proc.lastOutput) == 0 {
		return nil
	}
	out := make([]string, len(proc.lastOutput))
	copy(out, proc.lastOutput)
	return out
}

// ProbeHealth returns true if the given port/path responds with 2xx (e.g. after dashboard restart we can detect services we didn't start).
func (pm *ProcessManager) ProbeHealth(port int, path string) bool {
	if port <= 0 || path == "" {
		return false
	}
	url := fmt.Sprintf("http://localhost:%d%s", port, path)
	client := &http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

// KillProcessOnPort sends SIGTERM to any process listening on the given port (Unix). Used to stop "orphan" services that were left running before a dashboard restart.
func (pm *ProcessManager) KillProcessOnPort(port int) error {
	if port <= 0 {
		return nil
	}
	if runtime.GOOS == "windows" {
		// TODO: implement for Windows (netstat -ano, taskkill)
		return nil
	}
	// lsof -i :PORT -t outputs one PID per line
	out, err := exec.Command("lsof", "-i", fmt.Sprintf(":%d", port), "-t").Output()
	if err != nil {
		return nil // no process on port
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		pid, err := strconv.Atoi(line)
		if err != nil {
			continue
		}
		if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
			log.Printf("Failed to kill PID %d on port %d: %v", pid, port, err)
		}
	}
	return nil
}

// SubscribeLogs subscribes to log output from a service
func (pm *ProcessManager) SubscribeLogs(serviceName string) (<-chan string, func()) {
	pm.mu.RLock()
	proc, exists := pm.processes[serviceName]
	pm.mu.RUnlock()

	ch := make(chan string, 100)

	if !exists {
		close(ch)
		return ch, func() {}
	}

	proc.logMu.Lock()
	proc.subscribers[ch] = struct{}{}
	proc.logMu.Unlock()

	unsubscribe := func() {
		proc.logMu.Lock()
		delete(proc.subscribers, ch)
		close(ch)
		proc.logMu.Unlock()
	}

	return ch, unsubscribe
}

// captureOutput reads from a reader and broadcasts to subscribers
func (proc *ManagedProcess) captureOutput(reader io.Reader, prefix string) {
	scanner := bufio.NewScanner(reader)
	// Increase buffer size for long lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := prefix + scanner.Text()
		proc.broadcast(line)
		proc.appendLastOutput(line)
	}
}

// broadcast sends a log line to all subscribers and optional activity callback
func (proc *ManagedProcess) broadcast(line string) {
	if proc.onActivityLine != nil {
		proc.onActivityLine(line)
	}
	proc.logMu.RLock()
	defer proc.logMu.RUnlock()

	for ch := range proc.subscribers {
		select {
		case ch <- line:
		default:
			// Channel full, skip
		}
	}
}

// appendLastOutput keeps the last maxLastOutputLines for debugging failed starts
func (proc *ManagedProcess) appendLastOutput(line string) {
	proc.logMu.Lock()
	defer proc.logMu.Unlock()
	proc.lastOutput = append(proc.lastOutput, line)
	if len(proc.lastOutput) > maxLastOutputLines {
		proc.lastOutput = proc.lastOutput[len(proc.lastOutput)-maxLastOutputLines:]
	}
}

// loadEnvFile loads environment variables from .env file
func (pm *ProcessManager) loadEnvFile() ([]string, error) {
	envPath := filepath.Join(pm.wabisabyRoot, ".env")
	data, err := os.ReadFile(envPath)
	if err != nil {
		return nil, err
	}

	var envVars []string
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// Basic parsing: KEY=value
		if strings.Contains(line, "=") {
			envVars = append(envVars, line)
		}
	}

	return envVars, nil
}

// StartGroup starts all services in a group
func (pm *ProcessManager) StartGroup(group string) error {
	services := config.GetServicesByGroup(group)
	if len(services) == 0 {
		return fmt.Errorf("unknown group: %s", group)
	}

	var errors []string
	for _, svc := range services {
		if err := pm.Start(svc.Name); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", svc.Name, err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("failed to start some services: %s", strings.Join(errors, "; "))
	}
	return nil
}

// StopGroup stops all services in a group
func (pm *ProcessManager) StopGroup(group string) error {
	services := config.GetServicesByGroup(group)
	if len(services) == 0 {
		return fmt.Errorf("unknown group: %s", group)
	}

	var errors []string
	for _, svc := range services {
		if err := pm.Stop(svc.Name); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", svc.Name, err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("failed to stop some services: %s", strings.Join(errors, "; "))
	}
	return nil
}

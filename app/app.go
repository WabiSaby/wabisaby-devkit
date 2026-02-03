package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wabisaby/devkit-dashboard/internal/config"
	"github.com/wabisaby/devkit-dashboard/internal/git"
	"github.com/wabisaby/devkit-dashboard/internal/model"
	"github.com/wabisaby/devkit-dashboard/internal/service"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct holds the application state and dependencies
type App struct {
	ctx              context.Context
	devkitRoot       string
	projectsDir      string
	wabisabyCorePath string
	processManager   *service.ProcessManager
	migrationSvc     *service.MigrationService
	envSvc           *service.EnvService
	protoSvc         *service.ProtoService

	// Stream cancellation
	streamMu      sync.Mutex
	activeStreams map[string]context.CancelFunc
}

// NewApp creates a new App instance
func NewApp(cfg *config.Config) *App {
	processManager := service.NewProcessManager(cfg.WabisabyCorePath)
	migrationSvc := service.NewMigrationService(cfg.WabisabyCorePath)
	envSvc := service.NewEnvService(cfg.WabisabyCorePath)
	protoSvc := service.NewProtoService(cfg.ProjectsDir)

	return &App{
		devkitRoot:       cfg.DevKitRoot,
		projectsDir:      cfg.ProjectsDir,
		wabisabyCorePath: cfg.WabisabyCorePath,
		processManager:   processManager,
		migrationSvc:     migrationSvc,
		envSvc:           envSvc,
		protoSvc:         protoSvc,
		activeStreams:    make(map[string]context.CancelFunc),
	}
}

// Startup is called when the app starts
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Shutdown is called when the app is closing
func (a *App) Shutdown(ctx context.Context) {
	// Cancel all active streams
	a.streamMu.Lock()
	for _, cancel := range a.activeStreams {
		cancel()
	}
	a.activeStreams = make(map[string]context.CancelFunc)
	a.streamMu.Unlock()

	// Stop all backend processes
	a.processManager.StopAll()
}

// ====================
// Status API
// ====================

// Status returns the dashboard status
func (a *App) Status() map[string]string {
	return map[string]string{"message": "DevKit dashboard is running"}
}

// ====================
// Submodule API
// ====================

// SubmoduleSyncStatus returns project names that need sync
func (a *App) SubmoduleSyncStatus() (map[string]interface{}, error) {
	projects, err := service.GetProjects(a.projectsDir)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(projects))
	for _, p := range projects {
		names = append(names, p.Name)
	}
	needsSync, err := git.SubmoduleSyncStatus(a.devkitRoot, a.projectsDir, names)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"needsSync": needsSync}, nil
}

// SubmoduleSync stages and commits submodule ref changes in DevKit
func (a *App) SubmoduleSync(message string) (map[string]string, error) {
	projects, err := service.GetProjects(a.projectsDir)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(projects))
	for _, p := range projects {
		names = append(names, p.Name)
	}
	needsSync, err := git.SubmoduleSyncStatus(a.devkitRoot, a.projectsDir, names)
	if err != nil {
		return nil, err
	}
	if len(needsSync) == 0 {
		return map[string]string{"message": "No submodule changes to sync"}, nil
	}
	if err := git.SubmoduleSync(a.devkitRoot, a.projectsDir, needsSync, message); err != nil {
		return nil, err
	}
	return map[string]string{"message": "Submodules synced to DevKit"}, nil
}

// ====================
// Projects API
// ====================

// ListProjects returns all projects
func (a *App) ListProjects() ([]model.Project, error) {
	return service.GetProjects(a.projectsDir)
}

// ListProjectDependencies returns dependencies for a project
func (a *App) ListProjectDependencies(name string) ([]model.Dependency, error) {
	return service.GetProjectDependencies(a.projectsDir, name)
}

// ProjectClone clones a project submodule
func (a *App) ProjectClone(name string) (map[string]string, error) {
	if err := service.CloneProject(a.devkitRoot, a.projectsDir, name); err != nil {
		return nil, fmt.Errorf("failed to clone submodule: %w", err)
	}
	return map[string]string{"message": fmt.Sprintf("Successfully cloned %s", name)}, nil
}

// ProjectUpdate updates a project
func (a *App) ProjectUpdate(name string) (map[string]string, error) {
	projectDir := filepath.Join(a.projectsDir, name)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("project not found. Please clone the project first")
	}
	if err := service.UpdateProject(a.devkitRoot, a.projectsDir, name); err != nil {
		return nil, err
	}
	return map[string]string{"message": "update completed successfully"}, nil
}

// ProjectOpen opens a project in Cursor/VSCode
func (a *App) ProjectOpen(name string) (map[string]string, error) {
	projectDir := filepath.Join(a.projectsDir, name)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("project not found. Please clone the project first")
	}
	if err := service.OpenProject(a.devkitRoot, a.projectsDir, name); err != nil {
		return nil, err
	}
	return map[string]string{"message": "Opening workspace"}, nil
}

// CreateTag creates an annotated tag at HEAD and optionally pushes to origin
func (a *App) CreateTag(name, tag, message string, push bool) (map[string]string, error) {
	if name == "" {
		return nil, fmt.Errorf("project name is required")
	}
	tag = strings.TrimSpace(tag)
	if err := git.ValidateTagName(tag); err != nil {
		return nil, err
	}
	if message == "" {
		message = "Release " + tag
	}
	if err := service.CreateReleaseTag(a.devkitRoot, a.projectsDir, name, tag, message, push); err != nil {
		return nil, err
	}
	msg := "Tag " + tag + " created"
	if push {
		msg += " and pushed to remote"
	}
	return map[string]string{"message": msg}, nil
}

// ListTags returns existing tag names for the project
func (a *App) ListTags(name string) (map[string]interface{}, error) {
	if name == "" {
		return nil, fmt.Errorf("project name is required")
	}
	tags, err := service.ListProjectTags(a.devkitRoot, a.projectsDir, name)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"tags": tags}, nil
}

// StartProjectStream starts streaming project operation output
// Emits: devkit:project:stream and devkit:project:stream:done
func (a *App) StartProjectStream(name, action string) error {
	projectDir := filepath.Join(a.projectsDir, name)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return fmt.Errorf("project not found")
	}

	streamID := fmt.Sprintf("project:%s:%s", name, action)
	ctx, cancel := context.WithCancel(a.ctx)

	a.streamMu.Lock()
	// Cancel any existing stream for this project/action
	if existing, ok := a.activeStreams[streamID]; ok {
		existing()
	}
	a.activeStreams[streamID] = cancel
	a.streamMu.Unlock()

	go func() {
		defer func() {
			a.streamMu.Lock()
			delete(a.activeStreams, streamID)
			a.streamMu.Unlock()
		}()

		// Generate protos for wabisaby-core tests
		if name == "wabisaby-core" && action == "test" {
			protosDir := filepath.Join(a.projectsDir, "wabisaby-protos")
			if _, err := os.Stat(protosDir); err == nil {
				runtime.EventsEmit(a.ctx, "devkit:project:stream", map[string]interface{}{
					"project": name,
					"action":  action,
					"line":    "[INFO] Generating protobuf code in wabisaby-protos...",
				})

				protoCmd := exec.CommandContext(ctx, "make", "proto")
				protoCmd.Dir = protosDir
				protoOutput, err := protoCmd.CombinedOutput()
				if err != nil {
					runtime.EventsEmit(a.ctx, "devkit:project:stream", map[string]interface{}{
						"project": name,
						"action":  action,
						"line":    fmt.Sprintf("[WARNING] Failed to generate protos: %s", string(protoOutput)),
					})
					runtime.EventsEmit(a.ctx, "devkit:project:stream:done", map[string]interface{}{
						"project": name,
						"action":  action,
						"success": false,
						"error":   "Cannot run tests without generated protobuf code",
					})
					return
				}
				runtime.EventsEmit(a.ctx, "devkit:project:stream", map[string]interface{}{
					"project": name,
					"action":  action,
					"line":    "[INFO] Protobuf code generated successfully",
				})
			}
		}

		var cmd *exec.Cmd
		switch action {
		case "test":
			cmd = exec.CommandContext(ctx, "make", "test")
		case "build":
			cmd = exec.CommandContext(ctx, "make", "build")
		case "format":
			cmd = exec.CommandContext(ctx, "make", "format")
		case "lint":
			cmd = exec.CommandContext(ctx, "make", "lint")
		default:
			runtime.EventsEmit(a.ctx, "devkit:project:stream:done", map[string]interface{}{
				"project": name,
				"action":  action,
				"success": false,
				"error":   fmt.Sprintf("Unknown action: %s", action),
			})
			return
		}
		cmd.Dir = projectDir

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			runtime.EventsEmit(a.ctx, "devkit:project:stream:done", map[string]interface{}{
				"project": name,
				"action":  action,
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		stderr, err := cmd.StderrPipe()
		if err != nil {
			runtime.EventsEmit(a.ctx, "devkit:project:stream:done", map[string]interface{}{
				"project": name,
				"action":  action,
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			runtime.EventsEmit(a.ctx, "devkit:project:stream:done", map[string]interface{}{
				"project": name,
				"action":  action,
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		var wg sync.WaitGroup
		wg.Add(2)

		// Read stdout
		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				select {
				case <-ctx.Done():
					return
				default:
					runtime.EventsEmit(a.ctx, "devkit:project:stream", map[string]interface{}{
						"project": name,
						"action":  action,
						"line":    scanner.Text(),
					})
				}
			}
		}()

		// Read stderr
		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				select {
				case <-ctx.Done():
					return
				default:
					runtime.EventsEmit(a.ctx, "devkit:project:stream", map[string]interface{}{
						"project": name,
						"action":  action,
						"line":    "[ERROR] " + scanner.Text(),
					})
				}
			}
		}()

		wg.Wait()
		err = cmd.Wait()
		success := err == nil

		var exitCode int
		if err != nil {
			if exitError, ok := err.(*exec.ExitError); ok {
				exitCode = exitError.ExitCode()
			}
		}

		completeLine := "[COMPLETE] Operation completed successfully"
		if !success {
			completeLine = fmt.Sprintf("[COMPLETE] Operation failed with exit code %d", exitCode)
		}

		runtime.EventsEmit(a.ctx, "devkit:project:stream", map[string]interface{}{
			"project": name,
			"action":  action,
			"line":    completeLine,
		})

		runtime.EventsEmit(a.ctx, "devkit:project:stream:done", map[string]interface{}{
			"project":  name,
			"action":   action,
			"success":  success,
			"exitCode": exitCode,
		})
	}()

	return nil
}

// StopProjectStream stops an active project stream
func (a *App) StopProjectStream(name, action string) {
	streamID := fmt.Sprintf("project:%s:%s", name, action)
	a.streamMu.Lock()
	if cancel, ok := a.activeStreams[streamID]; ok {
		cancel()
		delete(a.activeStreams, streamID)
	}
	a.streamMu.Unlock()
}

// StartBulkProjectStream starts streaming bulk operation across all projects
// Emits: devkit:project:bulk:stream and devkit:project:bulk:stream:done
func (a *App) StartBulkProjectStream(action string) error {
	switch action {
	case "format", "lint", "test", "build":
	default:
		return fmt.Errorf("invalid bulk action: use format, lint, test, or build")
	}

	projects, err := service.GetProjects(a.projectsDir)
	if err != nil {
		return err
	}

	streamID := fmt.Sprintf("bulk:%s", action)
	ctx, cancel := context.WithCancel(a.ctx)

	a.streamMu.Lock()
	if existing, ok := a.activeStreams[streamID]; ok {
		existing()
	}
	a.activeStreams[streamID] = cancel
	a.streamMu.Unlock()

	go func() {
		defer func() {
			a.streamMu.Lock()
			delete(a.activeStreams, streamID)
			a.streamMu.Unlock()
		}()

		for _, p := range projects {
			select {
			case <-ctx.Done():
				return
			default:
			}

			projectDir := filepath.Join(a.projectsDir, p.Name)
			if _, err := os.Stat(projectDir); os.IsNotExist(err) {
				runtime.EventsEmit(a.ctx, "devkit:project:bulk:stream", map[string]interface{}{
					"project": p.Name,
					"action":  action,
					"line":    fmt.Sprintf("[%s] skipped (not cloned)", p.Name),
				})
				continue
			}

			runtime.EventsEmit(a.ctx, "devkit:project:bulk:stream", map[string]interface{}{
				"project": p.Name,
				"action":  action,
				"line":    fmt.Sprintf("[%s] Running make %s...", p.Name, action),
			})

			cmd := exec.CommandContext(ctx, "make", action)
			cmd.Dir = projectDir
			output, err := cmd.CombinedOutput()
			if err != nil {
				runtime.EventsEmit(a.ctx, "devkit:project:bulk:stream", map[string]interface{}{
					"project": p.Name,
					"action":  action,
					"line":    fmt.Sprintf("[%s] [ERROR] exit: %v", p.Name, err),
				})
			}
			lines := strings.Split(strings.TrimSuffix(string(output), "\n"), "\n")
			for _, line := range lines {
				if line == "" {
					continue
				}
				select {
				case <-ctx.Done():
					return
				default:
					runtime.EventsEmit(a.ctx, "devkit:project:bulk:stream", map[string]interface{}{
						"project": p.Name,
						"action":  action,
						"line":    fmt.Sprintf("[%s] %s", p.Name, line),
					})
				}
			}
		}

		runtime.EventsEmit(a.ctx, "devkit:project:bulk:stream", map[string]interface{}{
			"action": action,
			"line":   fmt.Sprintf("[COMPLETE] Bulk %s finished", action),
		})

		runtime.EventsEmit(a.ctx, "devkit:project:bulk:stream:done", map[string]interface{}{
			"action":  action,
			"success": true,
		})
	}()

	return nil
}

// StopBulkProjectStream stops an active bulk project stream
func (a *App) StopBulkProjectStream(action string) {
	streamID := fmt.Sprintf("bulk:%s", action)
	a.streamMu.Lock()
	if cancel, ok := a.activeStreams[streamID]; ok {
		cancel()
		delete(a.activeStreams, streamID)
	}
	a.streamMu.Unlock()
}

// ====================
// Services (Docker) API
// ====================

// Service UI URLs
var serviceUIURLs = map[string]string{
	"pgAdmin": "http://localhost:5050",
	"MinIO":   "http://localhost:9001",
	"Vault":   "http://localhost:8200",
}

// ListServices returns all Docker services with their status
func (a *App) ListServices() []model.Service {
	services := []model.Service{
		{Name: "PostgreSQL", Port: 5432},
		{Name: "Redis", Port: 6379},
		{Name: "MinIO", Port: 9000},
		{Name: "Vault", Port: 8200},
		{Name: "pgAdmin", Port: 5050},
	}

	for i := range services {
		services[i].Status = service.CheckServiceStatus(services[i].Name, services[i].Port, a.devkitRoot)
		if url, ok := serviceUIURLs[services[i].Name]; ok {
			services[i].URL = url
		}
	}

	return services
}

// StartService starts a Docker service
func (a *App) StartService(name string) (map[string]string, error) {
	if err := service.StartService(name, a.devkitRoot); err != nil {
		return nil, fmt.Errorf("failed to start %s: %w", name, err)
	}
	return map[string]string{"message": fmt.Sprintf("start %s completed", name)}, nil
}

// StopService stops a Docker service
func (a *App) StopService(name string) (map[string]string, error) {
	if err := service.StopService(name, a.devkitRoot); err != nil {
		return nil, fmt.Errorf("failed to stop %s: %w", name, err)
	}
	return map[string]string{"message": fmt.Sprintf("stop %s completed", name)}, nil
}

// StartAllServices starts all Docker services
func (a *App) StartAllServices() (map[string]string, error) {
	if err := service.StartAllServices(a.devkitRoot); err != nil {
		return nil, fmt.Errorf("failed to start all services: %w", err)
	}
	return map[string]string{"message": "start all completed"}, nil
}

// StopAllServices stops all Docker services
func (a *App) StopAllServices() (map[string]string, error) {
	if err := service.StopAllServices(a.devkitRoot); err != nil {
		return nil, fmt.Errorf("failed to stop all services: %w", err)
	}
	return map[string]string{"message": "stop all completed"}, nil
}

// Map service names to docker-compose service names
var serviceNameMap = map[string]string{
	"PostgreSQL": "postgres",
	"Redis":      "redis",
	"MinIO":      "minio",
	"Vault":      "vault",
	"pgAdmin":    "pgadmin",
}

// StartServiceLogsStream starts streaming Docker service logs
// Emits: devkit:service:logs and devkit:service:logs:done
func (a *App) StartServiceLogsStream(name string) error {
	composeServiceName, ok := serviceNameMap[name]
	if !ok {
		composeServiceName = strings.ToLower(name)
	}

	composeFile := filepath.Join(a.devkitRoot, "docker/docker-compose.yml")

	streamID := fmt.Sprintf("service:logs:%s", name)
	ctx, cancel := context.WithCancel(a.ctx)

	a.streamMu.Lock()
	if existing, ok := a.activeStreams[streamID]; ok {
		existing()
	}
	a.activeStreams[streamID] = cancel
	a.streamMu.Unlock()

	go func() {
		defer func() {
			a.streamMu.Lock()
			delete(a.activeStreams, streamID)
			a.streamMu.Unlock()
		}()

		cmd := exec.CommandContext(ctx, "docker-compose", "-f", composeFile, "logs", "-f", "--tail=500", composeServiceName)
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			runtime.EventsEmit(a.ctx, "devkit:service:logs:done", map[string]interface{}{
				"service": name,
				"error":   err.Error(),
			})
			return
		}

		stderr, err := cmd.StderrPipe()
		if err != nil {
			runtime.EventsEmit(a.ctx, "devkit:service:logs:done", map[string]interface{}{
				"service": name,
				"error":   err.Error(),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			runtime.EventsEmit(a.ctx, "devkit:service:logs:done", map[string]interface{}{
				"service": name,
				"error":   err.Error(),
			})
			return
		}

		runtime.EventsEmit(a.ctx, "devkit:service:logs", map[string]interface{}{
			"service": name,
			"line":    fmt.Sprintf("[Connected to %s logs]", name),
		})

		var wg sync.WaitGroup
		wg.Add(2)

		// Read stdout
		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				select {
				case <-ctx.Done():
					return
				default:
					runtime.EventsEmit(a.ctx, "devkit:service:logs", map[string]interface{}{
						"service": name,
						"line":    scanner.Text(),
					})
				}
			}
		}()

		// Read stderr
		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				select {
				case <-ctx.Done():
					return
				default:
					runtime.EventsEmit(a.ctx, "devkit:service:logs", map[string]interface{}{
						"service": name,
						"line":    "[ERROR] " + scanner.Text(),
					})
				}
			}
		}()

		wg.Wait()
		cmd.Wait()

		runtime.EventsEmit(a.ctx, "devkit:service:logs:done", map[string]interface{}{
			"service": name,
		})
	}()

	return nil
}

// StopServiceLogsStream stops an active service logs stream
func (a *App) StopServiceLogsStream(name string) {
	streamID := fmt.Sprintf("service:logs:%s", name)
	a.streamMu.Lock()
	if cancel, ok := a.activeStreams[streamID]; ok {
		cancel()
		delete(a.activeStreams, streamID)
	}
	a.streamMu.Unlock()
}

// ====================
// Backend (WabiSaby-Go) API
// ====================

// ListBackendServices returns all WabiSaby-Go services with their status
func (a *App) ListBackendServices() []model.BackendService {
	services := config.GetBackendServices()
	result := make([]model.BackendService, 0, len(services))

	for _, svc := range services {
		bs := model.BackendService{
			Name:   svc.Name,
			Group:  svc.Group,
			Port:   svc.Port,
			Status: a.processManager.GetStatus(svc.Name),
			PID:    a.processManager.GetPID(svc.Name),
			Error:  a.processManager.GetError(svc.Name),
		}

		// If not in process manager, detect running via health probe
		if bs.Status == "stopped" && svc.Port > 0 && svc.HealthPath != "" {
			if a.processManager.ProbeHealth(svc.Port, svc.HealthPath) {
				bs.Status = "running"
			}
		}

		// Add health and docs URLs for running services with ports
		if bs.Status == "running" && svc.Port > 0 {
			if svc.HealthPath != "" {
				bs.HealthURL = fmt.Sprintf("http://localhost:%d%s", svc.Port, svc.HealthPath)
			}
			if svc.DocsPath != "" {
				bs.DocsURL = fmt.Sprintf("http://localhost:%d%s", svc.Port, svc.DocsPath)
			}
		}

		result = append(result, bs)
	}

	return result
}

// BackendHealth proxies a GET to the service's health endpoint
func (a *App) BackendHealth(name string) (map[string]interface{}, error) {
	if name == "" {
		return nil, fmt.Errorf("service name required")
	}

	services := config.GetBackendServices()
	var svc *config.BackendServiceConfig
	for i := range services {
		if services[i].Name == name {
			svc = &services[i]
			break
		}
	}
	if svc == nil || svc.HealthPath == "" {
		return nil, fmt.Errorf("service has no health endpoint")
	}

	url := fmt.Sprintf("http://localhost:%d%s", svc.Port, svc.HealthPath)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return map[string]interface{}{
			"ok":         false,
			"statusCode": 0,
			"status":     "",
			"body":       err.Error(),
			"error":      err.Error(),
		}, nil
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	body := strings.TrimSpace(string(bodyBytes))

	return map[string]interface{}{
		"ok":         resp.StatusCode >= 200 && resp.StatusCode < 300,
		"statusCode": resp.StatusCode,
		"status":     resp.Status,
		"body":       body,
	}, nil
}

// StartBackendService starts a specific backend service
func (a *App) StartBackendService(name string) (map[string]string, error) {
	if name == "" {
		return nil, fmt.Errorf("service name required")
	}
	if err := a.processManager.Start(name); err != nil {
		return nil, fmt.Errorf("failed to start %s: %w", name, err)
	}
	return map[string]string{"message": fmt.Sprintf("Started %s", name)}, nil
}

// StopBackendService stops a specific backend service
func (a *App) StopBackendService(name string) (map[string]string, error) {
	if name == "" {
		return nil, fmt.Errorf("service name required")
	}
	svc := config.GetServiceByName(name)
	if err := a.processManager.Stop(name); err != nil {
		return nil, fmt.Errorf("failed to stop %s: %w", name, err)
	}
	// Also kill any process on the service port
	if svc != nil && svc.Port > 0 {
		_ = a.processManager.KillProcessOnPort(svc.Port)
	}
	return map[string]string{"message": fmt.Sprintf("Stopped %s", name)}, nil
}

// StartBackendGroup starts all services in a group
func (a *App) StartBackendGroup(group string) (map[string]string, error) {
	if group == "" {
		return nil, fmt.Errorf("group name required")
	}
	if err := a.processManager.StartGroup(group); err != nil {
		return nil, fmt.Errorf("failed to start group %s: %w", group, err)
	}
	return map[string]string{"message": fmt.Sprintf("Started all services in %s group", group)}, nil
}

// StopBackendGroup stops all services in a group
func (a *App) StopBackendGroup(group string) (map[string]string, error) {
	if group == "" {
		return nil, fmt.Errorf("group name required")
	}
	if err := a.processManager.StopGroup(group); err != nil {
		return nil, fmt.Errorf("failed to stop group %s: %w", group, err)
	}
	return map[string]string{"message": fmt.Sprintf("Stopped all services in %s group", group)}, nil
}

// StartBackendLogsStream starts streaming backend service logs
// Emits: devkit:backend:logs and devkit:backend:logs:done
func (a *App) StartBackendLogsStream(name string) error {
	if name == "" {
		return fmt.Errorf("service name required")
	}

	streamID := fmt.Sprintf("backend:logs:%s", name)
	ctx, cancel := context.WithCancel(a.ctx)

	a.streamMu.Lock()
	if existing, ok := a.activeStreams[streamID]; ok {
		existing()
	}
	a.activeStreams[streamID] = cancel
	a.streamMu.Unlock()

	go func() {
		defer func() {
			a.streamMu.Lock()
			delete(a.activeStreams, streamID)
			a.streamMu.Unlock()
		}()

		// Subscribe to logs
		logCh, unsubscribe := a.processManager.SubscribeLogs(name)
		defer unsubscribe()

		runtime.EventsEmit(a.ctx, "devkit:backend:logs", map[string]interface{}{
			"service": name,
			"line":    fmt.Sprintf("[Connected to %s logs]", name),
		})

		for {
			select {
			case <-ctx.Done():
				return
			case line, ok := <-logCh:
				if !ok {
					runtime.EventsEmit(a.ctx, "devkit:backend:logs", map[string]interface{}{
						"service": name,
						"line":    "[Log stream ended]",
					})
					runtime.EventsEmit(a.ctx, "devkit:backend:logs:done", map[string]interface{}{
						"service": name,
					})
					return
				}
				runtime.EventsEmit(a.ctx, "devkit:backend:logs", map[string]interface{}{
					"service": name,
					"line":    line,
				})
			}
		}
	}()

	return nil
}

// StopBackendLogsStream stops an active backend logs stream
func (a *App) StopBackendLogsStream(name string) {
	streamID := fmt.Sprintf("backend:logs:%s", name)
	a.streamMu.Lock()
	if cancel, ok := a.activeStreams[streamID]; ok {
		cancel()
		delete(a.activeStreams, streamID)
	}
	a.streamMu.Unlock()
}

// ====================
// Migrations API
// ====================

// GetMigrationStatus returns the current migration status
func (a *App) GetMigrationStatus() (*model.MigrationStatus, error) {
	return a.migrationSvc.GetStatus()
}

// RunMigrationUp runs pending migrations
func (a *App) RunMigrationUp() (map[string]string, error) {
	output, err := a.migrationSvc.Up()
	if err != nil {
		return nil, fmt.Errorf("migration failed: %w\n%s", err, output)
	}
	return map[string]string{"message": "Migrations applied", "output": output}, nil
}

// RunMigrationDown rolls back the last migration
func (a *App) RunMigrationDown() (map[string]string, error) {
	output, err := a.migrationSvc.Down()
	if err != nil {
		return nil, fmt.Errorf("migration rollback failed: %w\n%s", err, output)
	}
	return map[string]string{"message": "Migration rolled back", "output": output}, nil
}

// StartMigrationStream starts streaming migration output
// Emits: devkit:migration:stream and devkit:migration:stream:done
func (a *App) StartMigrationStream(action string) error {
	if action != "up" && action != "down" {
		return fmt.Errorf("invalid action (use 'up' or 'down')")
	}

	streamID := fmt.Sprintf("migration:%s", action)
	ctx, cancel := context.WithCancel(a.ctx)

	a.streamMu.Lock()
	if existing, ok := a.activeStreams[streamID]; ok {
		existing()
	}
	a.activeStreams[streamID] = cancel
	a.streamMu.Unlock()

	go func() {
		defer func() {
			a.streamMu.Lock()
			delete(a.activeStreams, streamID)
			a.streamMu.Unlock()
		}()

		var outputCh <-chan string
		var err error

		if action == "up" {
			outputCh, err = a.migrationSvc.UpStream(ctx)
		} else {
			outputCh, err = a.migrationSvc.DownStream(ctx)
		}

		if err != nil {
			runtime.EventsEmit(a.ctx, "devkit:migration:stream", map[string]interface{}{
				"action": action,
				"line":   fmt.Sprintf("[Error] %v", err),
			})
			runtime.EventsEmit(a.ctx, "devkit:migration:stream:done", map[string]interface{}{
				"action":  action,
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		runtime.EventsEmit(a.ctx, "devkit:migration:stream", map[string]interface{}{
			"action": action,
			"line":   fmt.Sprintf("[Starting migration %s...]", action),
		})

		for {
			select {
			case <-ctx.Done():
				return
			case line, ok := <-outputCh:
				if !ok {
					runtime.EventsEmit(a.ctx, "devkit:migration:stream:done", map[string]interface{}{
						"action":  action,
						"success": true,
					})
					return
				}
				runtime.EventsEmit(a.ctx, "devkit:migration:stream", map[string]interface{}{
					"action": action,
					"line":   line,
				})
			}
		}
	}()

	return nil
}

// StopMigrationStream stops an active migration stream
func (a *App) StopMigrationStream(action string) {
	streamID := fmt.Sprintf("migration:%s", action)
	a.streamMu.Lock()
	if cancel, ok := a.activeStreams[streamID]; ok {
		cancel()
		delete(a.activeStreams, streamID)
	}
	a.streamMu.Unlock()
}

// ====================
// Proto (codegen) API
// ====================

// GetProtoStatus returns whether generated protobuf code is out of date
func (a *App) GetProtoStatus() (*model.ProtoStatus, error) {
	return a.protoSvc.GetStatus()
}

// StartProtoStream runs make proto in wabisaby-protos and streams output
// Emits: devkit:proto:stream and devkit:proto:stream:done
func (a *App) StartProtoStream() error {
	streamID := "proto:generate"
	ctx, cancel := context.WithCancel(a.ctx)

	a.streamMu.Lock()
	if existing, ok := a.activeStreams[streamID]; ok {
		existing()
	}
	a.activeStreams[streamID] = cancel
	a.streamMu.Unlock()

	go func() {
		defer func() {
			a.streamMu.Lock()
			delete(a.activeStreams, streamID)
			a.streamMu.Unlock()
		}()

		outputCh, err := a.protoSvc.RunProtoStream(ctx)
		if err != nil {
			runtime.EventsEmit(a.ctx, "devkit:proto:stream", map[string]interface{}{
				"line": fmt.Sprintf("[Error] %v", err),
			})
			runtime.EventsEmit(a.ctx, "devkit:proto:stream:done", map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		runtime.EventsEmit(a.ctx, "devkit:proto:stream", map[string]interface{}{
			"line": "[Starting protobuf code generation...]",
		})

		for {
			select {
			case <-ctx.Done():
				return
			case line, ok := <-outputCh:
				if !ok {
					runtime.EventsEmit(a.ctx, "devkit:proto:stream:done", map[string]interface{}{
						"success": true,
					})
					return
				}
				runtime.EventsEmit(a.ctx, "devkit:proto:stream", map[string]interface{}{
					"line": line,
				})
			}
		}
	}()

	return nil
}

// StopProtoStream stops an active proto generation stream
func (a *App) StopProtoStream() {
	streamID := "proto:generate"
	a.streamMu.Lock()
	if cancel, ok := a.activeStreams[streamID]; ok {
		cancel()
		delete(a.activeStreams, streamID)
	}
	a.streamMu.Unlock()
}

// ====================
// Environment API
// ====================

// GetEnvStatus returns the environment configuration status
func (a *App) GetEnvStatus() (*model.EnvStatus, error) {
	return a.envSvc.GetStatus()
}

// CopyEnvExample copies env.example to .env
func (a *App) CopyEnvExample() (map[string]string, error) {
	if err := a.envSvc.CopyExample(); err != nil {
		return nil, fmt.Errorf("failed to copy env.example: %w", err)
	}
	return map[string]string{"message": "Copied env.example to .env"}, nil
}

// ValidateEnv validates the environment configuration
func (a *App) ValidateEnv() (map[string]interface{}, error) {
	missing, err := a.envSvc.Validate()
	if err != nil {
		return nil, fmt.Errorf("validation error: %w", err)
	}

	if len(missing) > 0 {
		return map[string]interface{}{
			"valid":   false,
			"missing": missing,
		}, nil
	}

	return map[string]interface{}{
		"valid":   true,
		"missing": []string{},
	}, nil
}

// ====================
// Prerequisites API
// ====================

// GetPrerequisites returns the status of required and optional tools
func (a *App) GetPrerequisites() ([]model.Prerequisite, error) {
	return service.CheckPrerequisites(), nil
}

// ====================
// Notices API
// ====================

// GetNotices returns aggregated dashboard notices (sync, proto, migration, env, docker)
func (a *App) GetNotices() ([]model.Notice, error) {
	var notices []model.Notice

	// Submodule sync
	projects, err := service.GetProjects(a.projectsDir)
	if err == nil {
		names := make([]string, 0, len(projects))
		for _, p := range projects {
			names = append(names, p.Name)
		}
		needsSync, errSync := git.SubmoduleSyncStatus(a.devkitRoot, a.projectsDir, names)
		if errSync == nil && len(needsSync) > 0 {
			notices = append(notices, model.Notice{
				ID:        "sync",
				Severity:  "warn",
				Message:   "Submodule commits have changed; sync to DevKit?",
				ActionKey: "sync",
			})
		}
	}

	// Protos out of date
	protoStatus, err := a.protoSvc.GetStatus()
	if err == nil && protoStatus.OutOfDate && protoStatus.Message != "wabisaby-protos not found" {
		notices = append(notices, model.Notice{
			ID:        "proto",
			Severity:  "warn",
			Message:   protoStatus.Message,
			ActionKey: "proto",
		})
	}

	// Migrations pending or dirty
	migStatus, err := a.migrationSvc.GetStatus()
	if err == nil && migStatus != nil {
		if migStatus.Dirty {
			notices = append(notices, model.Notice{
				ID:        "migration",
				Severity:  "warn",
				Message:   "Migration state is dirty",
				ActionKey: "migration",
			})
		} else {
			var pending uint
			for _, m := range migStatus.Migrations {
				if !m.Applied {
					pending++
				}
			}
			if pending > 0 {
				notices = append(notices, model.Notice{
					ID:        "migration",
					Severity:  "warn",
					Message:   fmt.Sprintf("%d migration(s) pending", pending),
					ActionKey: "migration",
				})
			}
		}
	}

	// Env missing or invalid
	envStatus, err := a.envSvc.GetStatus()
	if err == nil && envStatus != nil {
		if !envStatus.HasEnvFile {
			notices = append(notices, model.Notice{
				ID:        "env",
				Severity:  "warn",
				Message:   "No .env file; copy from env.example",
				ActionKey: "env",
			})
		} else {
			missing, errVal := a.envSvc.Validate()
			if errVal == nil && len(missing) > 0 {
				notices = append(notices, model.Notice{
					ID:        "env",
					Severity:  "warn",
					Message:   fmt.Sprintf("Missing required env var(s): %s", strings.Join(missing, ", ")),
					ActionKey: "env",
				})
			}
		}
	}

	// Docker services not running (check Postgres as representative)
	if service.CheckServiceStatus("PostgreSQL", 5432, a.devkitRoot) != "running" {
		notices = append(notices, model.Notice{
			ID:        "docker",
			Severity:  "info",
			Message:   "Docker services not running",
			ActionKey: "docker",
		})
	}

	// Stable order: by severity (error > warn > info), then by id
	order := map[string]int{"error": 0, "warn": 1, "info": 2}
	idOrder := map[string]int{"sync": 0, "proto": 1, "migration": 2, "env": 3, "docker": 4}
	// Sort: first by severity order, then by id order
	for i := 0; i < len(notices); i++ {
		for j := i + 1; j < len(notices); j++ {
			si, oki := order[notices[i].Severity]
			sj, okj := order[notices[j].Severity]
			if !oki {
				si = 99
			}
			if !okj {
				sj = 99
			}
			if si > sj || (si == sj && idOrder[notices[i].ID] > idOrder[notices[j].ID]) {
				notices[i], notices[j] = notices[j], notices[i]
			}
		}
	}

	return notices, nil
}

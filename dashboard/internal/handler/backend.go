package handler

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/wabisaby/devkit-dashboard/internal/config"
	"github.com/wabisaby/devkit-dashboard/internal/model"
	"github.com/wabisaby/devkit-dashboard/internal/service"
)

// BackendHandler handles WabiSaby-Go backend operations
type BackendHandler struct {
	processManager *service.ProcessManager
	migrationSvc   *service.MigrationService
	envSvc         *service.EnvService
	wabisabyRoot   string
}

// NewBackendHandler creates a new backend handler
func NewBackendHandler(pm *service.ProcessManager, ms *service.MigrationService, es *service.EnvService, wabisabyRoot string) *BackendHandler {
	return &BackendHandler{
		processManager: pm,
		migrationSvc:   ms,
		envSvc:         es,
		wabisabyRoot:   wabisabyRoot,
	}
}

// ListBackendServices returns all WabiSaby-Go services with their status
func (h *BackendHandler) ListBackendServices(w http.ResponseWriter, r *http.Request) {
	services := config.GetBackendServices()
	result := make([]model.BackendService, 0, len(services))

	for _, svc := range services {
		bs := model.BackendService{
			Name:   svc.Name,
			Group:  svc.Group,
			Port:   svc.Port,
			Status: h.processManager.GetStatus(svc.Name),
			PID:    h.processManager.GetPID(svc.Name),
			Error:  h.processManager.GetError(svc.Name),
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

	SendSuccess(w, result)
}

// StartBackendService starts a specific service
func (h *BackendHandler) StartBackendService(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		SendError(w, "Service name required", http.StatusBadRequest)
		return
	}

	if err := h.processManager.Start(name); err != nil {
		SendError(w, fmt.Sprintf("Failed to start %s: %v", name, err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": fmt.Sprintf("Started %s", name)})
}

// StopBackendService stops a specific service
func (h *BackendHandler) StopBackendService(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		SendError(w, "Service name required", http.StatusBadRequest)
		return
	}

	if err := h.processManager.Stop(name); err != nil {
		SendError(w, fmt.Sprintf("Failed to stop %s: %v", name, err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": fmt.Sprintf("Stopped %s", name)})
}

// StartAllInGroup starts all services in a group
func (h *BackendHandler) StartAllInGroup(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "" {
		SendError(w, "Group name required", http.StatusBadRequest)
		return
	}

	if err := h.processManager.StartGroup(group); err != nil {
		SendError(w, fmt.Sprintf("Failed to start group %s: %v", group, err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": fmt.Sprintf("Started all services in %s group", group)})
}

// StopAllInGroup stops all services in a group
func (h *BackendHandler) StopAllInGroup(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "" {
		SendError(w, "Group name required", http.StatusBadRequest)
		return
	}

	if err := h.processManager.StopGroup(group); err != nil {
		SendError(w, fmt.Sprintf("Failed to stop group %s: %v", group, err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": fmt.Sprintf("Stopped all services in %s group", group)})
}

// StreamServiceLogs streams logs for a service via SSE
func (h *BackendHandler) StreamServiceLogs(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		http.Error(w, "Service name required", http.StatusBadRequest)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// Subscribe to logs
	logCh, unsubscribe := h.processManager.SubscribeLogs(name)
	defer unsubscribe()

	ctx := r.Context()

	// Send initial message
	fmt.Fprintf(w, "data: [Connected to %s logs]\n\n", name)
	flusher.Flush()

	for {
		select {
		case <-ctx.Done():
			return
		case line, ok := <-logCh:
			if !ok {
				fmt.Fprintf(w, "data: [Log stream ended]\n\n")
				flusher.Flush()
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()
		}
	}
}

// GetMigrationStatus returns the current migration status
func (h *BackendHandler) GetMigrationStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.migrationSvc.GetStatus()
	if err != nil {
		SendError(w, fmt.Sprintf("Failed to get migration status: %v", err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, status)
}

// RunMigrationUp runs pending migrations
func (h *BackendHandler) RunMigrationUp(w http.ResponseWriter, r *http.Request) {
	output, err := h.migrationSvc.Up()
	if err != nil {
		SendError(w, fmt.Sprintf("Migration failed: %v\n%s", err, output), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": "Migrations applied", "output": output})
}

// RunMigrationDown rolls back the last migration
func (h *BackendHandler) RunMigrationDown(w http.ResponseWriter, r *http.Request) {
	output, err := h.migrationSvc.Down()
	if err != nil {
		SendError(w, fmt.Sprintf("Migration rollback failed: %v\n%s", err, output), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": "Migration rolled back", "output": output})
}

// StreamMigration streams migration output via SSE
func (h *BackendHandler) StreamMigration(w http.ResponseWriter, r *http.Request) {
	action := chi.URLParam(r, "action")
	if action != "up" && action != "down" {
		http.Error(w, "Invalid action (use 'up' or 'down')", http.StatusBadRequest)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()

	var outputCh <-chan string
	var err error

	if action == "up" {
		outputCh, err = h.migrationSvc.UpStream(ctx)
	} else {
		outputCh, err = h.migrationSvc.DownStream(ctx)
	}

	if err != nil {
		fmt.Fprintf(w, "data: [Error] %v\n\n", err)
		flusher.Flush()
		return
	}

	fmt.Fprintf(w, "data: [Starting migration %s...]\n\n", action)
	flusher.Flush()

	for {
		select {
		case <-ctx.Done():
			return
		case line, ok := <-outputCh:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()
		}
	}
}

// GetEnvStatus returns the environment configuration status
func (h *BackendHandler) GetEnvStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.envSvc.GetStatus()
	if err != nil {
		SendError(w, fmt.Sprintf("Failed to get env status: %v", err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, status)
}

// CopyEnvExample copies env.example to .env
func (h *BackendHandler) CopyEnvExample(w http.ResponseWriter, r *http.Request) {
	if err := h.envSvc.CopyExample(); err != nil {
		SendError(w, fmt.Sprintf("Failed to copy env.example: %v", err), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": "Copied env.example to .env"})
}

// ValidateEnv validates the environment configuration
func (h *BackendHandler) ValidateEnv(w http.ResponseWriter, r *http.Request) {
	missing, err := h.envSvc.Validate()
	if err != nil {
		SendError(w, fmt.Sprintf("Validation error: %v", err), http.StatusInternalServerError)
		return
	}

	if len(missing) > 0 {
		SendSuccess(w, map[string]interface{}{
			"valid":   false,
			"missing": missing,
		})
		return
	}

	SendSuccess(w, map[string]interface{}{
		"valid":   true,
		"missing": []string{},
	})
}

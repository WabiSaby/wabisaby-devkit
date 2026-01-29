package handler

import (
	"bufio"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/wabisaby/devkit-dashboard/internal/model"
	"github.com/wabisaby/devkit-dashboard/internal/service"
)

type ServiceHandler struct {
	devkitRoot string
}

func NewServiceHandler(devkitRoot string) *ServiceHandler {
	return &ServiceHandler{devkitRoot: devkitRoot}
}

// ListServices returns all services with their status
func (h *ServiceHandler) ListServices(w http.ResponseWriter, r *http.Request) {
	services := []model.Service{
		{Name: "PostgreSQL", Port: 5432},
		{Name: "Redis", Port: 6379},
		{Name: "MinIO", Port: 9000},
		{Name: "Vault", Port: 8200},
		{Name: "pgAdmin", Port: 5050},
	}

	// Check actual service status
	for i := range services {
		services[i].Status = service.CheckServiceStatus(services[i].Name, services[i].Port, h.devkitRoot)
	}

	SendSuccess(w, services)
}

// HandleServiceAction handles service actions (start, stop)
func (h *ServiceHandler) HandleServiceAction(w http.ResponseWriter, r *http.Request) {
	serviceName := chi.URLParam(r, "name")
	if serviceName == "" {
		// Try to get from path for "all" routes
		if strings.Contains(r.URL.Path, "/all/") {
			serviceName = "all"
		}
	}
	
	// Extract action from URL path
	path := strings.TrimPrefix(r.URL.Path, "/api/services/")
	if serviceName == "all" {
		path = strings.TrimPrefix(path, "all/")
	} else if serviceName != "" {
		path = strings.TrimPrefix(path, serviceName+"/")
	}
	action := path

	var err error
	if serviceName == "all" {
		if action == "start" {
			err = service.StartAllServices(h.devkitRoot)
		} else if action == "stop" {
			err = service.StopAllServices(h.devkitRoot)
		} else {
			SendError(w, "Unknown action", http.StatusBadRequest)
			return
		}
	} else {
		if action == "start" {
			err = service.StartService(serviceName, h.devkitRoot)
		} else if action == "stop" {
			err = service.StopService(serviceName, h.devkitRoot)
		} else {
			SendError(w, "Unknown action", http.StatusBadRequest)
			return
		}
	}

	if err != nil {
		SendError(w, fmt.Sprintf("Error: %s", err.Error()), http.StatusInternalServerError)
		return
	}

	SendSuccess(w, map[string]string{"message": fmt.Sprintf("%s %s completed", action, serviceName)})
}

// HandleServiceLogsStream streams service logs
func (h *ServiceHandler) HandleServiceLogsStream(w http.ResponseWriter, r *http.Request) {
	serviceName := chi.URLParam(r, "name")

	// Map service names to docker-compose service names
	serviceMap := map[string]string{
		"PostgreSQL": "postgres",
		"Redis":      "redis",
		"MinIO":      "minio",
		"Vault":      "vault",
		"pgAdmin":    "pgadmin",
	}

	composeServiceName, ok := serviceMap[serviceName]
	if !ok {
		composeServiceName = strings.ToLower(serviceName)
	}

	composeFile := filepath.Join(h.devkitRoot, "docker/docker-compose.yml")

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

	// Execute docker-compose logs with follow mode
	cmd := exec.Command("docker-compose", "-f", composeFile, "logs", "-f", "--tail=500", composeServiceName)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Fprintf(w, "data: Error: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		fmt.Fprintf(w, "data: Error: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(w, "data: Error starting command: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	ctx := r.Context()
	done := make(chan bool)

	// Read stdout
	go func() {
		defer func() { done <- true }()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()
			select {
			case <-ctx.Done():
				return
			default:
			}
		}
		if err := scanner.Err(); err != nil {
			fmt.Fprintf(w, "data: Error reading logs: %s\n\n", err.Error())
			flusher.Flush()
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			fmt.Fprintf(w, "data: [ERROR] %s\n\n", line)
			flusher.Flush()
			select {
			case <-ctx.Done():
				return
			default:
			}
		}
	}()

	// Wait for client disconnect or command completion
	select {
	case <-ctx.Done():
		cmd.Process.Kill()
		cmd.Wait()
	case <-done:
		cmd.Wait()
	}
}

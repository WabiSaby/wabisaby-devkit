package handler

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/wabisaby/devkit-dashboard/internal/git"
	"github.com/wabisaby/devkit-dashboard/internal/service"
)

// CreateTagRequest is the JSON body for creating a release tag.
type CreateTagRequest struct {
	TagName string `json:"tag"`
	Message string `json:"message"`
	Push    bool   `json:"push"`
}

type ProjectHandler struct {
	devkitRoot string
}

func NewProjectHandler(devkitRoot string) *ProjectHandler {
	return &ProjectHandler{devkitRoot: devkitRoot}
}

// ListProjects returns all projects
func (h *ProjectHandler) ListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := service.GetProjects(h.devkitRoot)
	if err != nil {
		SendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	SendSuccess(w, projects)
}

// HandleCreateTag creates an annotated tag at HEAD and optionally pushes to origin.
func (h *ProjectHandler) HandleCreateTag(w http.ResponseWriter, r *http.Request) {
	projectName := chi.URLParam(r, "name")
	if projectName == "" {
		SendError(w, "project name is required", http.StatusBadRequest)
		return
	}
	var req CreateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		SendError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	tagName := strings.TrimSpace(req.TagName)
	if err := git.ValidateTagName(tagName); err != nil {
		SendError(w, err.Error(), http.StatusBadRequest)
		return
	}
	message := strings.TrimSpace(req.Message)
	if message == "" {
		message = "Release " + tagName
	}
	err := service.CreateReleaseTag(h.devkitRoot, projectName, tagName, message, req.Push)
	if err != nil {
		if err.Error() == "tag already exists" {
			SendError(w, err.Error(), http.StatusConflict)
			return
		}
		SendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	msg := "Tag " + tagName + " created"
	if req.Push {
		msg += " and pushed to remote"
	}
	SendSuccess(w, map[string]string{"message": msg})
}

// HandleListTags returns existing tag names for the project.
func (h *ProjectHandler) HandleListTags(w http.ResponseWriter, r *http.Request) {
	projectName := chi.URLParam(r, "name")
	if projectName == "" {
		SendError(w, "project name is required", http.StatusBadRequest)
		return
	}
	tags, err := service.ListProjectTags(h.devkitRoot, projectName)
	if err != nil {
		SendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	SendSuccess(w, map[string]interface{}{"tags": tags})
}

// HandleProjectAction handles project actions (clone, update, test, build, open)
func (h *ProjectHandler) HandleProjectAction(w http.ResponseWriter, r *http.Request) {
	projectName := chi.URLParam(r, "name")

	// Extract action from URL path (after /api/projects/{name}/)
	path := strings.TrimPrefix(r.URL.Path, "/api/projects/"+projectName+"/")
	action := path

	projectDir := filepath.Join(h.devkitRoot, "projects", projectName)

	// Allow "clone" action to proceed even if directory doesn't exist
	if action != "clone" {
		if _, err := os.Stat(projectDir); os.IsNotExist(err) {
			if action == "open" {
				SendError(w, "Project not found. Please click 'Clone' button first to download the project.", http.StatusNotFound)
			} else {
				SendError(w, "Project not found. Please clone the project first using the 'Clone' button.", http.StatusNotFound)
			}
			return
		}
	}

	var err error
	switch action {
	case "clone":
		err = service.CloneProject(h.devkitRoot, projectName)
		if err != nil {
			SendError(w, fmt.Sprintf("Failed to clone submodule: %s", err.Error()), http.StatusInternalServerError)
			return
		}
		SendSuccess(w, map[string]string{"message": fmt.Sprintf("Successfully cloned %s", projectName)})
		return
	case "update":
		err = service.UpdateProject(h.devkitRoot, projectName)
		if err != nil {
			SendError(w, fmt.Sprintf("Error: %s", err.Error()), http.StatusInternalServerError)
			return
		}
		SendSuccess(w, map[string]string{"message": "update completed successfully"})
		return
	case "test", "build":
		// For non-streaming requests, return immediately
		SendSuccess(w, map[string]string{"message": fmt.Sprintf("Starting %s for %s", action, projectName)})
		return
	case "open":
		err = service.OpenProject(h.devkitRoot, projectName)
		if err != nil {
			SendError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		SendSuccess(w, map[string]string{"message": "Opening workspace"})
		return
	default:
		SendError(w, "Unknown action", http.StatusBadRequest)
		return
	}
}

// HandleProjectStream handles streaming for test/build operations
func (h *ProjectHandler) HandleProjectStream(w http.ResponseWriter, r *http.Request) {
	projectName := chi.URLParam(r, "name")
	action := chi.URLParam(r, "action")
	h.handleProjectOperationStream(w, r, projectName, action)
}

// handleProjectOperationStream streams project operation output
func (h *ProjectHandler) handleProjectOperationStream(w http.ResponseWriter, r *http.Request, projectName, action string) {
	projectDir := filepath.Join(h.devkitRoot, "projects", projectName)

	// Check if project exists
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		http.Error(w, "Project not found", http.StatusNotFound)
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

	// Generate protos for wabisaby-core tests
	if projectName == "wabisaby-core" && action == "test" {
		protosDir := filepath.Join(h.devkitRoot, "projects", "wabisaby-protos")
		if _, err := os.Stat(protosDir); err == nil {
			fmt.Fprintf(w, "data: [INFO] Generating protobuf code in wabisaby-protos...\n\n")
			flusher.Flush()

			protoCmd := exec.Command("make", "proto")
			protoCmd.Dir = protosDir
			protoOutput, err := protoCmd.CombinedOutput()
			if err != nil {
				log.Printf("Failed to generate protos: %v, output: %s", err, string(protoOutput))
				fmt.Fprintf(w, "data: [WARNING] Failed to generate protos: %s\n\n", string(protoOutput))
				flusher.Flush()
				fmt.Fprintf(w, "data: [ERROR] Cannot run tests without generated protobuf code. Please run 'make proto' in wabisaby-protos first.\n\n")
				flusher.Flush()
				return
			}
			fmt.Fprintf(w, "data: [INFO] Protobuf code generated successfully\n\n")
			flusher.Flush()
		}
	}

	// Determine command
	var cmd *exec.Cmd
	switch action {
	case "test":
		cmd = exec.Command("make", "test")
	case "build":
		cmd = exec.Command("make", "build")
	default:
		fmt.Fprintf(w, "data: Error: Unknown action %s\n\n", action)
		flusher.Flush()
		return
	}

	cmd.Dir = projectDir

	// Set up pipes
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

	// Start command
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(w, "data: Error starting command: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	ctx := r.Context()
	done := make(chan bool)
	var exitCode int

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
			fmt.Fprintf(w, "data: Error reading output: %s\n\n", err.Error())
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

	// Wait for completion
	go func() {
		err := cmd.Wait()
		if err != nil {
			if exitError, ok := err.(*exec.ExitError); ok {
				exitCode = exitError.ExitCode()
			}
		}
		done <- true
	}()

	// Wait for client disconnect or command completion
	select {
	case <-ctx.Done():
		cmd.Process.Kill()
		cmd.Wait()
	case <-done:
		if exitCode == 0 {
			fmt.Fprintf(w, "data: [COMPLETE] Operation completed successfully\n\n")
		} else {
			fmt.Fprintf(w, "data: [COMPLETE] Operation failed with exit code %d\n\n", exitCode)
		}
		flusher.Flush()
		cmd.Wait()
	}
}

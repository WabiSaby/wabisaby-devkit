package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

type Project struct {
	Name   string `json:"name"`
	Branch string `json:"branch"`
	Commit string `json:"commit"`
	Dirty  bool   `json:"dirty"`
	Status string `json:"status"`
}

type Service struct {
	Name   string `json:"name"`
	Port   int    `json:"port"`
	Status string `json:"status"`
}

type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

var devkitRoot string

func init() {
	// Get DevKit root (parent of ui directory)
	wd, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	devkitRoot = filepath.Dir(wd)
}

func main() {
	// Serve static files
	http.Handle("/", http.FileServer(http.Dir(".")))

	// API endpoints
	http.HandleFunc("/api/projects", handleProjects)
	http.HandleFunc("/api/projects/", handleProjectAction)
	http.HandleFunc("/api/services", handleServices)
	http.HandleFunc("/api/services/", handleServiceRequest)
	http.HandleFunc("/api/status", handleStatus)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting DevKit dashboard server on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleProjects(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	projects := []Project{
		{Name: "wabisaby-core"},
		{Name: "wabisaby-protos"},
		{Name: "wabisaby-plugin-sdk-go"},
		{Name: "wabisaby-plugins"},
	}

	// Get status for each project
	for i := range projects {
		project := &projects[i]
		projectDir := filepath.Join(devkitRoot, "projects", project.Name)

		// Check if project directory exists
		if _, err := os.Stat(projectDir); os.IsNotExist(err) {
			project.Status = "not-cloned"
			project.Branch = ""
			project.Commit = ""
			project.Dirty = false
		} else {
			// Get branch
			if branch, err := getGitBranch(projectDir); err == nil {
				project.Branch = branch
			}

			// Get commit
			if commit, err := getGitCommit(projectDir); err == nil {
				project.Commit = commit
			}

			// Check if dirty
			project.Dirty = isGitDirty(projectDir)

			// Determine status
			if project.Dirty {
				project.Status = "dirty"
			} else {
				project.Status = "clean"
			}
		}
	}

	sendJSON(w, Response{Success: true, Data: projects})
}

func handleProjectAction(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/projects/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	projectName := parts[0]
	action := parts[1]

	// Handle streaming requests for build/test operations
	if (action == "test" || action == "build") && len(parts) >= 3 && parts[2] == "stream" && r.Method == http.MethodGet {
		handleProjectOperationStream(w, r, projectName, action)
		return
	}

	projectDir := filepath.Join(devkitRoot, "projects", projectName)

	// Allow "clone" action to proceed even if directory doesn't exist
	// For other actions, check if project exists first
	if action != "clone" {
		if _, err := os.Stat(projectDir); os.IsNotExist(err) {
			// For "open" action, don't auto-initialize - user should use "Clone" button first
			if action == "open" {
				sendJSON(w, Response{
					Success: false,
					Message: fmt.Sprintf("Project not found. Please click 'Clone' button first to download the project.", projectName),
				})
				return
			}
			// For other actions, return error
			sendJSON(w, Response{
				Success: false,
				Message: fmt.Sprintf("Project not found. Please clone the project first using the 'Clone' button.", projectName),
			})
			return
		}
	}

	var cmd *exec.Cmd
	switch action {
	case "clone":
		// Clone/initialize the submodule
		if err := initializeSubmodule(projectName); err != nil {
			sendJSON(w, Response{
				Success: false,
				Message: fmt.Sprintf("Failed to clone submodule: %s", err.Error()),
			})
			return
		}
		// Verify it was cloned
		if _, err := os.Stat(projectDir); os.IsNotExist(err) {
			sendJSON(w, Response{
				Success: false,
				Message: fmt.Sprintf("Submodule cloned but directory not found at %s", projectDir),
			})
			return
		}
		sendJSON(w, Response{
			Success: true,
			Message: fmt.Sprintf("Successfully cloned %s", projectName),
		})
		return
	case "update":
		cmd = exec.Command("git", "submodule", "update", "--remote", projectName)
		cmd.Dir = devkitRoot
	case "test":
		// Ensure dependencies are generated before running tests
		// wabisaby-core depends on wabisaby-protos, so generate protos first
		if projectName == "wabisaby-core" {
			protosDir := filepath.Join(devkitRoot, "projects", "wabisaby-protos")
			if _, err := os.Stat(protosDir); err == nil {
				// Always generate protos to ensure they're up to date
				// This is fast and ensures consistency
				protoCmd := exec.Command("make", "proto")
				protoCmd.Dir = protosDir
				if err := protoCmd.Run(); err != nil {
					log.Printf("Warning: Failed to generate protos before test: %v", err)
					// Continue anyway - maybe they're already generated
				}
			}
		}

		// For non-streaming requests, return immediately with success
		// The frontend will handle streaming separately
		sendJSON(w, Response{
			Success: true,
			Message: fmt.Sprintf("Starting test for %s", projectName),
		})
		return
	case "build":
		// For non-streaming requests, return immediately with success
		// The frontend will handle streaming separately
		sendJSON(w, Response{
			Success: true,
			Message: fmt.Sprintf("Starting build for %s", projectName),
		})
		return
	case "open":
		// Open all projects in a single workspace (Cursor preferred, fallback to VSCode)
		editor, err := detectEditor()
		if err != nil {
			log.Printf("Editor detection failed: %v", err)
			sendJSON(w, Response{
				Success: false,
				Message: fmt.Sprintf("No editor found. Please install Cursor or VSCode and ensure 'cursor' or 'code' command is in PATH. Error: %s", err.Error()),
			})
			return
		}

		// Generate workspace file with all cloned projects
		workspaceFile, err := generateWorkspaceFile()
		if err != nil {
			log.Printf("Failed to generate workspace file: %v", err)
			sendJSON(w, Response{
				Success: false,
				Message: fmt.Sprintf("Failed to generate workspace file: %s", err.Error()),
			})
			return
		}

		log.Printf("Opening workspace in %s (workspace file: %s)", editor, workspaceFile)

		// Use macOS 'open' command if available, otherwise use direct command
		if runtime.GOOS == "darwin" {
			// On macOS, try using 'open' command first (more reliable)
			// Try with app name, if that fails, use the direct command
			var openCmd *exec.Cmd
			if editor == "cursor" {
				// Try Cursor app name first
				openCmd = exec.Command("open", "-a", "Cursor", workspaceFile)
			} else if editor == "code" {
				// Try Visual Studio Code app name
				openCmd = exec.Command("open", "-a", "Visual Studio Code", workspaceFile)
			}

			if openCmd != nil {
				// Try the 'open' command first
				err = openCmd.Run()
				if err == nil {
					log.Printf("Successfully opened workspace using 'open' command")
					sendJSON(w, Response{
						Success: true,
						Message: fmt.Sprintf("Opening workspace in %s", editor),
					})
					return
				}
				log.Printf("'open' command failed: %v, falling back to direct command", err)
				// If 'open' fails, fall through to direct command
			}
		}

		// Use direct editor command (works on all platforms)
		cmd = exec.Command(editor, workspaceFile)

		// Detach the process from the parent on Unix systems
		if runtime.GOOS != "windows" {
			cmd.SysProcAttr = &syscall.SysProcAttr{
				Setpgid: true,
			}
		}

		// Don't wait for the command to complete - it opens in background
		err = cmd.Start()
		if err != nil {
			log.Printf("Failed to start editor command: %v", err)
			sendJSON(w, Response{
				Success: false,
				Message: fmt.Sprintf("Failed to open editor: %s. Make sure %s is installed and in your PATH.", err.Error(), editor),
			})
			return
		}

		log.Printf("Editor command started successfully for workspace")

		// Detach from the process so it doesn't get killed when HTTP request completes
		go func() {
			cmd.Wait()
		}()

		sendJSON(w, Response{
			Success: true,
			Message: fmt.Sprintf("Opening workspace in %s", editor),
		})
		return
	default:
		sendJSON(w, Response{Success: false, Message: "Unknown action"})
		return
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		sendJSON(w, Response{
			Success: false,
			Message: fmt.Sprintf("Error: %s\nOutput: %s", err.Error(), string(output)),
		})
		return
	}

	sendJSON(w, Response{
		Success: true,
		Message: fmt.Sprintf("%s completed successfully", action),
		Data:    string(output),
	})
}

func handleProjectOperationStream(w http.ResponseWriter, r *http.Request, projectName, action string) {
	projectDir := filepath.Join(devkitRoot, "projects", projectName)

	// Check if project exists
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	// Set SSE headers first (before any output)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Ensure we can flush
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// Ensure dependencies are generated before running tests
	// wabisaby-core depends on wabisaby-protos, so generate protos first
	if projectName == "wabisaby-core" && action == "test" {
		protosDir := filepath.Join(devkitRoot, "projects", "wabisaby-protos")
		if _, err := os.Stat(protosDir); err == nil {
			// Send message to client that we're generating protos
			fmt.Fprintf(w, "data: [INFO] Generating protobuf code in wabisaby-protos...\n\n")
			flusher.Flush()

			// Always generate protos to ensure they're up to date
			// This is fast and ensures consistency
			protoCmd := exec.Command("make", "proto")
			protoCmd.Dir = protosDir
			protoOutput, err := protoCmd.CombinedOutput()
			if err != nil {
				// Log the full error for debugging
				log.Printf("Failed to generate protos: %v, output: %s", err, string(protoOutput))
				fmt.Fprintf(w, "data: [WARNING] Failed to generate protos: %s\n\n", string(protoOutput))
				flusher.Flush()
				// Don't continue if proto generation fails - tests will fail anyway
				fmt.Fprintf(w, "data: [ERROR] Cannot run tests without generated protobuf code. Please run 'make proto' in wabisaby-protos first.\n\n")
				flusher.Flush()
				return
			} else {
				fmt.Fprintf(w, "data: [INFO] Protobuf code generated successfully\n\n")
				flusher.Flush()
			}
		} else {
			log.Printf("wabisaby-protos directory not found at %s", protosDir)
			fmt.Fprintf(w, "data: [WARNING] wabisaby-protos directory not found. Tests may fail.\n\n")
			flusher.Flush()
		}
	}

	// Determine command based on action
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

	// Start the command
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(w, "data: Error starting command: %s\n\n", err.Error())
		flusher.Flush()
		return
	}

	// Monitor client disconnect
	ctx := r.Context()
	done := make(chan bool)
	var exitCode int

	// Read stdout line by line
	go func() {
		defer func() {
			done <- true
		}()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			// Send as SSE event
			fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()

			// Check if client disconnected
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

	// Wait for command completion or client disconnect
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
		// Client disconnected, kill the command
		cmd.Process.Kill()
		cmd.Wait()
	case <-done:
		// Command completed
		if exitCode == 0 {
			fmt.Fprintf(w, "data: [COMPLETE] Operation completed successfully\n\n")
		} else {
			fmt.Fprintf(w, "data: [COMPLETE] Operation failed with exit code %d\n\n", exitCode)
		}
		flusher.Flush()
		cmd.Wait()
	}
}

func handleServices(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		services := []Service{
			{Name: "PostgreSQL", Port: 5432},
			{Name: "Redis", Port: 6379},
			{Name: "MinIO", Port: 9000},
			{Name: "Vault", Port: 8200},
			{Name: "pgAdmin", Port: 5050},
		}

		// Check actual service status
		for i := range services {
			services[i].Status = checkServiceStatus(services[i].Name, services[i].Port)
		}

		sendJSON(w, Response{Success: true, Data: services})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handleServiceRequest(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/services/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	serviceName := parts[0]
	action := parts[1]

	// Handle logs stream request (SSE)
	if action == "logs" && len(parts) >= 3 && parts[2] == "stream" && r.Method == http.MethodGet {
		handleServiceLogsStream(w, r, serviceName)
		return
	}

	// Handle logs request (one-time fetch)
	if action == "logs" && r.Method == http.MethodGet {
		handleServiceLogs(w, r, serviceName)
		return
	}

	// Handle other actions (start/stop)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	handleServiceAction(w, r, serviceName, action)
}

func handleServiceAction(w http.ResponseWriter, r *http.Request, serviceName, action string) {

	// Map service names to docker-compose service names
	serviceMap := map[string]string{
		"PostgreSQL": "postgres",
		"Redis":      "redis",
		"MinIO":      "minio",
		"Vault":      "vault",
		"pgAdmin":    "pgadmin",
	}

	var cmd *exec.Cmd
	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")

	if serviceName == "all" {
		if action == "start" {
			cmd = exec.Command("docker-compose", "-f", composeFile, "up", "-d")
		} else if action == "stop" {
			cmd = exec.Command("docker-compose", "-f", composeFile, "down")
		} else {
			sendJSON(w, Response{Success: false, Message: "Unknown action"})
			return
		}
	} else {
		composeServiceName, ok := serviceMap[serviceName]
		if !ok {
			composeServiceName = strings.ToLower(serviceName)
		}

		if action == "start" {
			cmd = exec.Command("docker-compose", "-f", composeFile, "up", "-d", composeServiceName)
		} else if action == "stop" {
			cmd = exec.Command("docker-compose", "-f", composeFile, "stop", composeServiceName)
		} else {
			sendJSON(w, Response{Success: false, Message: "Unknown action"})
			return
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		sendJSON(w, Response{
			Success: false,
			Message: fmt.Sprintf("Error: %s\nOutput: %s", err.Error(), string(output)),
		})
		return
	}

	sendJSON(w, Response{
		Success: true,
		Message: fmt.Sprintf("%s %s completed", action, serviceName),
		Data:    string(output),
	})
}

func handleServiceLogs(w http.ResponseWriter, r *http.Request, serviceName string) {
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

	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")

	// Get logs with tail limit (last 500 lines)
	cmd := exec.Command("docker-compose", "-f", composeFile, "logs", "--tail=500", composeServiceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		sendJSON(w, Response{
			Success: false,
			Message: fmt.Sprintf("Error fetching logs: %s", err.Error()),
		})
		return
	}

	sendJSON(w, Response{
		Success: true,
		Data:    string(output),
	})
}

func handleServiceLogsStream(w http.ResponseWriter, r *http.Request, serviceName string) {
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

	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering if present

	// Ensure we can flush
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

	// Monitor client disconnect
	ctx := r.Context()
	done := make(chan bool)

	// Read stdout line by line
	go func() {
		defer func() {
			done <- true
		}()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			// Send as SSE event
			fmt.Fprintf(w, "data: %s\n\n", line)
			flusher.Flush()

			// Check if client disconnected
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
		// Client disconnected, kill the command
		cmd.Process.Kill()
		cmd.Wait()
	case <-done:
		// Command completed
		cmd.Wait()
	}
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, Response{
		Success: true,
		Message: "DevKit dashboard is running",
	})
}

func getGitBranch(dir string) (string, error) {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = dir
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func getGitCommit(dir string) (string, error) {
	cmd := exec.Command("git", "rev-parse", "--short", "HEAD")
	cmd.Dir = dir
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func isGitDirty(dir string) bool {
	cmd := exec.Command("git", "diff", "--quiet")
	cmd.Dir = dir
	err1 := cmd.Run()

	cmd = exec.Command("git", "diff", "--cached", "--quiet")
	cmd.Dir = dir
	err2 := cmd.Run()

	return err1 != nil || err2 != nil
}

func checkServiceStatus(name string, port int) string {
	// Map service names to Docker container names
	containerMap := map[string]string{
		"PostgreSQL": "wabisaby-postgres",
		"Redis":      "wabisaby-redis",
		"MinIO":      "wabisaby-minio",
		"Vault":      "wabisaby-vault",
		"pgAdmin":    "wabisaby-pgadmin",
	}

	containerName, ok := containerMap[name]
	if !ok {
		return "unknown"
	}

	// Check if container is running
	cmd := exec.Command("docker", "ps", "--filter", fmt.Sprintf("name=%s", containerName), "--format", "{{.Status}}")
	output, err := cmd.Output()
	if err != nil {
		return "stopped"
	}

	if len(output) > 0 {
		return "running"
	}
	return "stopped"
}

func sendJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func detectEditor() (string, error) {
	// Prefer Cursor, fallback to VSCode
	editors := []string{"cursor", "code"}

	for _, editor := range editors {
		// Check if command exists in PATH
		path, err := exec.LookPath(editor)
		if err == nil && path != "" {
			return editor, nil
		}
	}

	return "", fmt.Errorf("neither 'cursor' nor 'code' command found in PATH")
}

func generateWorkspaceFile() (string, error) {
	// Define the workspace file path
	workspaceFile := filepath.Join(devkitRoot, "wabisaby-devkit.code-workspace")

	// Scan projects directory for cloned projects
	projectsDir := filepath.Join(devkitRoot, "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return "", fmt.Errorf("failed to read projects directory: %v", err)
	}

	// Build list of folders for cloned projects
	var folders []map[string]string
	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
			projectPath := filepath.Join(projectsDir, entry.Name())
			// Check if it's actually a valid project directory (has some content)
			if info, err := os.Stat(projectPath); err == nil && info.IsDir() {
				// Use relative path from devkit root
				relativePath := filepath.Join("projects", entry.Name())
				folders = append(folders, map[string]string{
					"path": relativePath,
				})
			}
		}
	}

	// Create workspace structure
	workspace := map[string]interface{}{
		"folders":  folders,
		"settings": map[string]interface{}{},
	}

	// Marshal to JSON with indentation
	workspaceJSON, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal workspace JSON: %v", err)
	}

	// Write workspace file
	err = os.WriteFile(workspaceFile, workspaceJSON, 0644)
	if err != nil {
		return "", fmt.Errorf("failed to write workspace file: %v", err)
	}

	log.Printf("Generated workspace file: %s with %d projects", workspaceFile, len(folders))
	return workspaceFile, nil
}

func initializeSubmodule(projectName string) error {
	// Check if we're in a git repository
	gitDir := filepath.Join(devkitRoot, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		return fmt.Errorf("not a git repository (no .git directory found)")
	}

	// Check if .gitmodules exists
	gitmodulesPath := filepath.Join(devkitRoot, ".gitmodules")
	if _, err := os.Stat(gitmodulesPath); os.IsNotExist(err) {
		return fmt.Errorf(".gitmodules not found")
	}

	// Ensure projects directory exists
	projectsDir := filepath.Join(devkitRoot, "projects")
	if err := os.MkdirAll(projectsDir, 0755); err != nil {
		return fmt.Errorf("failed to create projects directory: %v", err)
	}

	projectDir := filepath.Join(devkitRoot, "projects", projectName)
	log.Printf("Attempting to initialize submodule: %s (target path: %s, devkitRoot: %s)", projectName, projectDir, devkitRoot)

	// Sync submodules first - this updates git's internal config from .gitmodules
	cmd := exec.Command("git", "submodule", "sync")
	cmd.Dir = devkitRoot
	syncOutput, syncErr := cmd.CombinedOutput()
	log.Printf("git submodule sync output: %s (error: %v)", string(syncOutput), syncErr)

	// Check if submodules are in git index - if .gitmodules was just changed, they might not be
	cmd = exec.Command("git", "ls-files", "--stage", "--", "projects")
	cmd.Dir = devkitRoot
	lsFilesOutput, _ := cmd.CombinedOutput()
	log.Printf("Git ls-files for projects: %s", string(lsFilesOutput))

	// First, check git submodule status to see what's registered
	cmd = exec.Command("git", "submodule", "status")
	cmd.Dir = devkitRoot
	statusOutput, _ := cmd.CombinedOutput()
	log.Printf("Current submodule status: %s", string(statusOutput))

	// If submodule status is empty, the submodules might not be in git's index
	// Try to add them using git submodule add (but only if they're not already there)
	if len(strings.TrimSpace(string(statusOutput))) == 0 {
		log.Printf("No submodules registered. Attempting to register submodules from .gitmodules...")
		// Read .gitmodules to get submodule URLs and add them
		// For each submodule in .gitmodules, we need to ensure it's in the index
		// But actually, if .gitmodules exists, we should be able to init them
		// The issue might be that the paths in .gitmodules don't match what git expects
	}

	// Check if .gitmodules has the project
	cmd = exec.Command("git", "config", "--file", ".gitmodules", "--get-regexp", "path")
	cmd.Dir = devkitRoot
	configOutput, _ := cmd.CombinedOutput()
	log.Printf("Submodule paths in .gitmodules: %s", string(configOutput))

	// Initialize all submodules first (this registers them)
	cmd = exec.Command("git", "submodule", "init")
	cmd.Dir = devkitRoot
	initOutput, initErr := cmd.CombinedOutput()
	log.Printf("git submodule init output: %s (error: %v)", string(initOutput), initErr)
	if initErr != nil {
		// Continue anyway - might already be initialized or might fail if submodules aren't registered
		log.Printf("git submodule init had error but continuing: %v", initErr)
	}

	// Check if submodules are actually registered in git
	// If submodule status is empty, git doesn't know about them yet
	// In this case, we need to manually clone the repository
	if len(strings.TrimSpace(string(statusOutput))) == 0 {
		log.Printf("No submodules registered in git. Manually cloning repository...")

		// Get the URL from .gitmodules
		urlCmd := exec.Command("git", "config", "--file", ".gitmodules", "--get", fmt.Sprintf("submodule.%s.url", projectName))
		urlCmd.Dir = devkitRoot
		urlOutput, urlErr := urlCmd.CombinedOutput()
		if urlErr != nil {
			return fmt.Errorf("failed to get submodule URL from .gitmodules: %s", string(urlOutput))
		}
		submoduleURL := strings.TrimSpace(string(urlOutput))
		log.Printf("Found submodule URL: %s", submoduleURL)

		// Manually clone the repository
		cloneCmd := exec.Command("git", "clone", submoduleURL, projectDir)
		cloneOutput, cloneErr := cloneCmd.CombinedOutput()
		if cloneErr != nil {
			return fmt.Errorf("failed to clone repository: %s. Output: %s", cloneErr.Error(), string(cloneOutput))
		}
		log.Printf("Successfully cloned repository manually. Output: %s", string(cloneOutput))
	} else {
		// Submodules are registered, use normal git submodule commands
		submodulePath := filepath.Join("projects", projectName)

		// Try to update/init the specific submodule
		cmd = exec.Command("git", "submodule", "update", "--init", submodulePath)
		cmd.Dir = devkitRoot
		output, err := cmd.CombinedOutput()
		log.Printf("git submodule update --init %s: output=%s, error=%v", submodulePath, string(output), err)

		if err != nil {
			log.Printf("Failed to initialize specific submodule %s at path %s: %s. Trying all submodules...", projectName, submodulePath, string(output))
			// Fall back to initializing all submodules
			cmd = exec.Command("git", "submodule", "update", "--init", "--recursive")
			cmd.Dir = devkitRoot
			output2, err2 := cmd.CombinedOutput()
			log.Printf("git submodule update --init --recursive: output=%s, error=%v", string(output2), err2)
			if err2 != nil {
				return fmt.Errorf("failed to initialize submodule: %s (also tried recursive: %s)", string(output), string(output2))
			}
			log.Printf("Successfully initialized all submodules recursively. Output: %s", string(output2))
		} else {
			log.Printf("Successfully initialized submodule %s at path %s. Output: %s", projectName, submodulePath, string(output))
		}
	}

	// Verify the directory was actually created
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		// Directory still doesn't exist - check if maybe the path is different
		// List what was actually created in projects/ directory
		projectsDir := filepath.Join(devkitRoot, "projects")
		entries, readErr := os.ReadDir(projectsDir)
		var dirs []string
		if readErr == nil {
			for _, entry := range entries {
				if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
					dirs = append(dirs, entry.Name())
				}
			}
		}

		// Also check root level in case something went wrong
		rootEntries, _ := os.ReadDir(devkitRoot)
		var rootDirs []string
		for _, entry := range rootEntries {
			if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") && entry.Name() != "projects" {
				rootDirs = append(rootDirs, entry.Name())
			}
		}

		// Check submodule status again
		cmd = exec.Command("git", "submodule", "status")
		cmd.Dir = devkitRoot
		finalStatus, _ := cmd.CombinedOutput()

		return fmt.Errorf("submodule directory '%s' was not created at %s after initialization. Projects dir contents: %v, Root dir contents: %v. Submodule status: %s",
			projectName, projectDir, dirs, rootDirs, string(finalStatus))
	}

	log.Printf("Successfully verified submodule directory exists: %s", projectDir)
	return nil
}

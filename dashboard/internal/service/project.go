package service

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"github.com/wabisaby/devkit-dashboard/internal/git"
	"github.com/wabisaby/devkit-dashboard/internal/model"
)

// GetProjects returns a list of all projects with their status
func GetProjects(devkitRoot string) ([]model.Project, error) {
	projects := []model.Project{
		{Name: "wabisaby-core"},
		{Name: "wabisaby-protos"},
		{Name: "wabisaby-plugin-sdk-go"},
		{Name: "wabisaby-plugins"},
	}

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
			if branch, err := git.GetBranch(projectDir); err == nil {
				project.Branch = branch
			}

			// Get commit
			if commit, err := git.GetCommit(projectDir); err == nil {
				project.Commit = commit
			}

			// Check if dirty
			project.Dirty = git.IsDirty(projectDir)

			// Determine status
			if project.Dirty {
				project.Status = "dirty"
			} else {
				project.Status = "clean"
			}
		}
	}

	return projects, nil
}

// CloneProject clones/initializes a project submodule
func CloneProject(devkitRoot, projectName string) error {
	return git.InitializeSubmodule(devkitRoot, projectName)
}

// UpdateProject updates a project submodule
func UpdateProject(devkitRoot, projectName string) error {
	cmd := exec.Command("git", "submodule", "update", "--remote", projectName)
	cmd.Dir = devkitRoot
	return cmd.Run()
}

// OpenProject opens a project in the editor
func OpenProject(devkitRoot, projectName string) error {
	editor, err := detectEditor()
	if err != nil {
		return fmt.Errorf("no editor found: %w", err)
	}

	workspaceFile, err := generateWorkspaceFile(devkitRoot)
	if err != nil {
		return fmt.Errorf("failed to generate workspace file: %w", err)
	}

	// Use macOS 'open' command if available
	if runtime.GOOS == "darwin" {
		var openCmd *exec.Cmd
		if editor == "cursor" {
			openCmd = exec.Command("open", "-a", "Cursor", workspaceFile)
		} else if editor == "code" {
			openCmd = exec.Command("open", "-a", "Visual Studio Code", workspaceFile)
		}

		if openCmd != nil {
			if err := openCmd.Run(); err == nil {
				return nil
			}
		}
	}

	// Use direct editor command
	cmd := exec.Command(editor, workspaceFile)

	// Detach the process from the parent on Unix systems
	if runtime.GOOS != "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			Setpgid: true,
		}
	}

	// Don't wait for the command to complete
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start editor: %w", err)
	}

	// Detach from the process
	go func() {
		cmd.Wait()
	}()

	return nil
}

// detectEditor detects available editor (Cursor or VSCode)
func detectEditor() (string, error) {
	editors := []string{"cursor", "code"}

	for _, editor := range editors {
		if path, err := exec.LookPath(editor); err == nil && path != "" {
			return editor, nil
		}
	}

	return "", fmt.Errorf("neither 'cursor' nor 'code' command found in PATH")
}

// generateWorkspaceFile generates a VSCode/Cursor workspace file
func generateWorkspaceFile(devkitRoot string) (string, error) {
	workspaceFile := filepath.Join(devkitRoot, "wabisaby-devkit.code-workspace")

	// Scan projects directory for cloned projects
	projectsDir := filepath.Join(devkitRoot, "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return "", fmt.Errorf("failed to read projects directory: %w", err)
	}

	// Build list of folders for cloned projects
	type Folder struct {
		Path string `json:"path"`
	}
	var folders []Folder
	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
			projectPath := filepath.Join(projectsDir, entry.Name())
			if info, err := os.Stat(projectPath); err == nil && info.IsDir() {
				// Use relative path from devkit root
				relativePath := filepath.Join("projects", entry.Name())
				folders = append(folders, Folder{Path: relativePath})
			}
		}
	}

	// Create workspace structure
	type Workspace struct {
		Folders  []Folder               `json:"folders"`
		Settings map[string]interface{} `json:"settings"`
	}
	workspace := Workspace{
		Folders:  folders,
		Settings: make(map[string]interface{}),
	}

	// Marshal to JSON with indentation
	workspaceJSON, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal workspace JSON: %w", err)
	}

	// Write workspace file
	if err := os.WriteFile(workspaceFile, workspaceJSON, 0644); err != nil {
		return "", fmt.Errorf("failed to write workspace file: %w", err)
	}

	return workspaceFile, nil
}

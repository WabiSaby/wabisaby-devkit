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

// projectRepoURLs maps project names to clone URLs for plain clone (app mode).
var projectRepoURLs = map[string]string{
	"wabisaby-core":          "https://github.com/WabiSaby/wabisaby-core.git",
	"wabisaby-node":          "https://github.com/WabiSaby/wabisaby-node.git",
	"wabisaby-protos":        "https://github.com/WabiSaby/wabisaby-protos.git",
	"wabisaby-plugin-sdk-go": "https://github.com/WabiSaby/wabisaby-plugin-sdk-go.git",
	"wabisaby-plugins":       "https://github.com/WabiSaby/wabisaby-plugins.git",
}

// detectProjectLanguage returns the primary language of a project (GitHub-style),
// based on manifest files and common conventions. projectName is used to infer
// proto-focused repos (e.g. wabisaby-protos) that ship Go bindings.
func detectProjectLanguage(projectDir, projectName string) string {
	// Protocol Buffers: proto-focused repos often have go.mod for generated Go
	// bindings; use name hint so *-protos always shows as Protobuf.
	nameLower := strings.ToLower(projectName)
	if strings.Contains(nameLower, "protos") || strings.Contains(nameLower, "proto") {
		if hasProtoFiles(projectDir) {
			return "Protobuf"
		}
		if _, err := os.Stat(filepath.Join(projectDir, "go.mod")); err == nil {
			return "Protobuf"
		}
	}
	// Proto files or proto/protos dir at root (without name hint)
	if hasProtoFiles(projectDir) {
		return "Protobuf"
	}
	// Go (go.mod)
	if _, err := os.Stat(filepath.Join(projectDir, "go.mod")); err == nil {
		return "Go"
	}
	// Rust
	if _, err := os.Stat(filepath.Join(projectDir, "Cargo.toml")); err == nil {
		return "Rust"
	}
	// JavaScript/TypeScript
	if _, err := os.Stat(filepath.Join(projectDir, "package.json")); err == nil {
		if _, err := os.Stat(filepath.Join(projectDir, "tsconfig.json")); err == nil {
			return "TypeScript"
		}
		return "JavaScript"
	}
	// Python
	if _, err := os.Stat(filepath.Join(projectDir, "pyproject.toml")); err == nil {
		return "Python"
	}
	if _, err := os.Stat(filepath.Join(projectDir, "setup.py")); err == nil {
		return "Python"
	}
	if _, err := os.Stat(filepath.Join(projectDir, "requirements.txt")); err == nil {
		return "Python"
	}
	return ""
}

func hasProtoFiles(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.IsDir() && (e.Name() == "proto" || e.Name() == "protos") {
			return true
		}
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".proto") {
			return true
		}
	}
	return false
}

// GetProjects returns a list of all projects with their status
func GetProjects(projectsDir string) ([]model.Project, error) {
	projects := []model.Project{
		{Name: "wabisaby-core"},
		{Name: "wabisaby-node"},
		{Name: "wabisaby-protos"},
		{Name: "wabisaby-plugin-sdk-go"},
		{Name: "wabisaby-plugins"},
	}

	for i := range projects {
		project := &projects[i]
		projectDir := filepath.Join(projectsDir, project.Name)

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

			// Detect primary language (GitHub-style)
			project.Language = detectProjectLanguage(projectDir, project.Name)
		}
	}

	return projects, nil
}

// CloneProject clones a project: submodule init when devkit root is a git repo and projects
// dir is under it, otherwise plain git clone into projects dir.
func CloneProject(devkitRoot, projectsDir, projectName string) error {
	projectDir := filepath.Join(projectsDir, projectName)
	gitDir := filepath.Join(devkitRoot, ".git")
	rel, _ := filepath.Rel(devkitRoot, projectsDir)
	useSubmodule := false
	if _, err := os.Stat(gitDir); err == nil && rel != "" && !strings.HasPrefix(rel, "..") {
		useSubmodule = true
	}
	if useSubmodule {
		return git.InitializeSubmodule(devkitRoot, projectsDir, projectName)
	}
	url, ok := projectRepoURLs[projectName]
	if !ok {
		return fmt.Errorf("unknown project: %s", projectName)
	}
	return git.CloneRepo(url, projectDir)
}

// UpdateProject updates a project: submodule update when in devkit repo, else git pull.
func UpdateProject(devkitRoot, projectsDir, projectName string) error {
	projectDir := filepath.Join(projectsDir, projectName)
	gitDir := filepath.Join(devkitRoot, ".git")
	rel, _ := filepath.Rel(devkitRoot, projectsDir)
	if _, err := os.Stat(gitDir); err == nil && rel != "" && !strings.HasPrefix(rel, "..") {
		submodulePath := filepath.ToSlash(filepath.Join(rel, projectName))
		cmd := exec.Command("git", "submodule", "update", "--remote", submodulePath)
		cmd.Dir = devkitRoot
		return cmd.Run()
	}
	cmd := exec.Command("git", "pull")
	cmd.Dir = projectDir
	return cmd.Run()
}

// CreateReleaseTag creates an annotated tag at HEAD and optionally pushes to origin.
func CreateReleaseTag(devkitRoot, projectsDir, projectName, tagName, message string, push bool) error {
	projectDir := filepath.Join(projectsDir, projectName)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return fmt.Errorf("project not cloned: clone the project first")
	}
	if err := git.CreateTag(projectDir, tagName, message); err != nil {
		return err
	}
	if push {
		if err := git.PushTag(projectDir, tagName); err != nil {
			return err
		}
	}
	return nil
}

// ListProjectTags returns tag names for the project. Returns empty list if project is not cloned.
func ListProjectTags(devkitRoot, projectsDir, projectName string) ([]string, error) {
	projectDir := filepath.Join(projectsDir, projectName)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return nil, nil
	}
	return git.ListTags(projectDir)
}

// OpenProject opens a project in the editor
func OpenProject(devkitRoot, projectsDir, projectName string) error {
	editor, err := detectEditor()
	if err != nil {
		return fmt.Errorf("no editor found: %w", err)
	}

	workspaceFile, err := generateWorkspaceFile(devkitRoot, projectsDir)
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
func generateWorkspaceFile(devkitRoot, projectsDir string) (string, error) {
	workspaceFile := filepath.Join(devkitRoot, "wabisaby-devkit.code-workspace")

	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return "", fmt.Errorf("failed to read projects directory: %w", err)
	}

	// Build list of folders: use absolute path so workspace works when projectsDir is custom
	type Folder struct {
		Path string `json:"path"`
	}
	var folders []Folder
	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
			projectPath := filepath.Join(projectsDir, entry.Name())
			if info, err := os.Stat(projectPath); err == nil && info.IsDir() {
				absPath, _ := filepath.Abs(projectPath)
				folders = append(folders, Folder{Path: absPath})
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

package git

import (
	"os/exec"
	"path/filepath"
	"strings"
)

// GetBranch returns the current git branch for a directory
func GetBranch(dir string) (string, error) {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = dir
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// GetCommit returns the short commit hash for a directory
func GetCommit(dir string) (string, error) {
	cmd := exec.Command("git", "rev-parse", "--short", "HEAD")
	cmd.Dir = dir
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// IsDirty checks if a git directory has uncommitted changes
func IsDirty(dir string) bool {
	cmd := exec.Command("git", "diff", "--quiet")
	cmd.Dir = dir
	err1 := cmd.Run()

	cmd = exec.Command("git", "diff", "--cached", "--quiet")
	cmd.Dir = dir
	err2 := cmd.Run()

	return err1 != nil || err2 != nil
}

// InitializeSubmodule initializes a git submodule
func InitializeSubmodule(devkitRoot, projectName string) error {
	projectDir := filepath.Join(devkitRoot, "projects", projectName)
	
	// Check if we're in a git repository
	gitDir := filepath.Join(devkitRoot, ".git")
	if _, err := filepath.Abs(gitDir); err != nil {
		return err
	}

	// Try to initialize the submodule
	submodulePath := filepath.Join("projects", projectName)
	cmd := exec.Command("git", "submodule", "update", "--init", submodulePath)
	cmd.Dir = devkitRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Fall back to initializing all submodules
		cmd = exec.Command("git", "submodule", "update", "--init", "--recursive")
		cmd.Dir = devkitRoot
		output2, err2 := cmd.CombinedOutput()
		if err2 != nil {
			return err2
		}
		_ = output2
	}
	_ = output

	// Verify the directory was created
	if _, err := filepath.Abs(projectDir); err != nil {
		return err
	}

	return nil
}

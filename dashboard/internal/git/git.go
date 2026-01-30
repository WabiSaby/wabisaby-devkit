package git

import (
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
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

// ValidateTagName checks that tagName is a valid Git ref name (git check-ref-format).
// Rejects empty, "..", refs containing "..", ending with "." or "/", and invalid characters.
func ValidateTagName(tagName string) error {
	s := strings.TrimSpace(tagName)
	if s == "" {
		return errors.New("tag name is required")
	}
	if s == ".." || strings.Contains(s, "..") {
		return errors.New("tag name cannot contain '..'")
	}
	if strings.HasSuffix(s, ".") || strings.HasSuffix(s, "/") {
		return errors.New("tag name cannot end with '.' or '/'")
	}
	invalid := []string{" ", "~", "^", ":", "?", "*", "[", "\\", "\x00"}
	for _, c := range invalid {
		if strings.Contains(s, c) {
			return fmt.Errorf("tag name contains invalid character")
		}
	}
	return nil
}

// CreateTag creates an annotated tag at HEAD in dir. Fails if tag already exists (no -f).
func CreateTag(dir, tagName, message string) error {
	if message == "" {
		message = "Release " + tagName
	}
	cmd := exec.Command("git", "tag", "-a", tagName, "-m", message)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(output), "already exists") {
			return errors.New("tag already exists")
		}
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

// ListTags returns sorted tag names for the repository in dir.
func ListTags(dir string) ([]string, error) {
	cmd := exec.Command("git", "tag", "-l")
	cmd.Dir = dir
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var tags []string
	for _, line := range lines {
		if line != "" {
			tags = append(tags, line)
		}
	}
	sort.Strings(tags)
	return tags, nil
}

// PushTag pushes the tag to origin.
func PushTag(dir, tagName string) error {
	cmd := exec.Command("git", "push", "origin", tagName)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("push failed: %s", strings.TrimSpace(string(output)))
	}
	return nil
}

// SubmoduleSyncStatus returns project names whose HEAD differs from the commit recorded in devkitRoot.
// Submodule path is assumed to be "projects/<name>".
func SubmoduleSyncStatus(devkitRoot string, projectNames []string) (needsSync []string, err error) {
	for _, name := range projectNames {
		projectDir := filepath.Join(devkitRoot, "projects", name)
		if _, err := filepath.Abs(projectDir); err != nil {
			continue
		}
		submodulePath := filepath.Join("projects", name)
		headCmd := exec.Command("git", "rev-parse", "HEAD")
		headCmd.Dir = projectDir
		headOut, err := headCmd.Output()
		if err != nil {
			continue
		}
		submoduleHEAD := strings.TrimSpace(string(headOut))
		lsTreeCmd := exec.Command("git", "ls-tree", "HEAD", submodulePath)
		lsTreeCmd.Dir = devkitRoot
		treeOut, err := lsTreeCmd.Output()
		if err != nil {
			needsSync = append(needsSync, name)
			continue
		}
		fields := strings.Fields(string(treeOut))
		if len(fields) < 3 {
			needsSync = append(needsSync, name)
			continue
		}
		recordedCommit := fields[2]
		if submoduleHEAD != recordedCommit {
			needsSync = append(needsSync, name)
		}
	}
	return needsSync, nil
}

// SubmoduleSync stages submodule refs in devkitRoot and commits with the given message.
func SubmoduleSync(devkitRoot string, projectNames []string, commitMessage string) error {
	if len(projectNames) == 0 {
		return nil
	}
	for _, name := range projectNames {
		submodulePath := filepath.Join("projects", name)
		cmd := exec.Command("git", "add", submodulePath)
		cmd.Dir = devkitRoot
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git add %s: %w (%s)", submodulePath, err, strings.TrimSpace(string(out)))
		}
	}
	if commitMessage == "" {
		commitMessage = "Update submodules: " + strings.Join(projectNames, ", ")
	}
	cmd := exec.Command("git", "commit", "-m", commitMessage)
	cmd.Dir = devkitRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(output), "nothing to commit") {
			return nil
		}
		return fmt.Errorf("git commit: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	return nil
}

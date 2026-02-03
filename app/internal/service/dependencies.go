package service

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wabisaby/devkit-dashboard/internal/model"
)

// wabisabyProjectNames returns the set of project folder names under projectsDir (only Wabi Saby projects).
func wabisabyProjectNames(projectsDir string) map[string]bool {
	names := make(map[string]bool)
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return names
	}
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			names[e.Name()] = true
		}
	}
	return names
}

// isWabisabyProject returns true if depName refers to a project in the Wabi Saby projects dir.
// Handles Go module paths (e.g. github.com/WabiSaby/wabisaby-core) and plain names (e.g. wabisaby-protos).
func isWabisabyProject(depName string, projectNames map[string]bool) bool {
	if projectNames[depName] {
		return true
	}
	// Go-style path: last path component is the project name
	last := depName
	if idx := strings.LastIndex(depName, "/"); idx >= 0 {
		last = depName[idx+1:]
	}
	return projectNames[last]
}

// GetProjectDependencies returns a list of dependencies for the given project,
// limited to dependencies that are Wabi Saby projects (exist under projectsDir).
func GetProjectDependencies(projectsDir, projectName string) ([]model.Dependency, error) {
	projectDir := filepath.Join(projectsDir, projectName)
	if _, err := os.Stat(projectDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("project not found")
	}

	var all []model.Dependency
	// Check for Go (go.mod)
	if _, err := os.Stat(filepath.Join(projectDir, "go.mod")); err == nil {
		var err error
		all, err = getGoDependencies(projectDir)
		if err != nil {
			return nil, err
		}
	} else if _, err := os.Stat(filepath.Join(projectDir, "package.json")); err == nil {
		// Node (package.json)
		var err error
		all, err = getNodeDependencies(projectDir)
		if err != nil {
			return nil, err
		}
	} else {
		return []model.Dependency{}, nil
	}

	projectNames := wabisabyProjectNames(projectsDir)
	filtered := make([]model.Dependency, 0, len(all))
	for _, d := range all {
		if isWabisabyProject(d.Name, projectNames) {
			filtered = append(filtered, d)
		}
	}
	return filtered, nil
}

func getGoDependencies(dir string) ([]model.Dependency, error) {
	cmd := exec.Command("go", "list", "-m", "-json", "all")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Fallback to simple go.mod parsing if go list fails
		deps, fallbackErr := parseGoMod(dir)
		if fallbackErr == nil {
			return deps, nil
		}
		return nil, fmt.Errorf("go list failed: %s (%w). Fallback also failed: %v", string(output), err, fallbackErr)
	}

	var deps []model.Dependency
	dec := json.NewDecoder(strings.NewReader(string(output)))
	for dec.More() {
		var mod struct {
			Path     string `json:"Path"`
			Version  string `json:"Version"`
			Main     bool   `json:"Main"`
			Indirect bool   `json:"Indirect"`
		}
		if err := dec.Decode(&mod); err != nil {
			break
		}
		if mod.Main {
			continue
		}

		depType := "direct"
		if mod.Indirect {
			depType = "indirect"
		}

		deps = append(deps, model.Dependency{
			Name:    mod.Path,
			Version: mod.Version,
			Type:    depType,
		})
	}
	return deps, nil
}

// parseGoMod is a simple fallback that parses go.mod for direct requirements
func parseGoMod(dir string) ([]model.Dependency, error) {
	content, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	if err != nil {
		return nil, err
	}

	var deps []model.Dependency
	lines := strings.Split(string(content), "\n")
	inRequire := false

	for _, line := range lines {
		line = strings.TrimSpace(line)

		if line == "require (" {
			inRequire = true
			continue
		}
		if line == ")" {
			inRequire = false
			continue
		}

		if strings.HasPrefix(line, "require ") {
			parts := strings.Fields(line[8:])
			if len(parts) >= 2 {
				depType := "direct"
				if strings.Contains(line, "// indirect") {
					depType = "indirect"
				}
				deps = append(deps, model.Dependency{
					Name:    parts[0],
					Version: parts[1],
					Type:    depType,
				})
			}
		} else if inRequire && line != "" {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				depType := "direct"
				if strings.Contains(line, "// indirect") {
					depType = "indirect"
				}
				deps = append(deps, model.Dependency{
					Name:    parts[0],
					Version: parts[1],
					Type:    depType,
				})
			}
		}
	}
	return deps, nil
}

func getNodeDependencies(dir string) ([]model.Dependency, error) {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("failed to read package.json: %w", err)
	}

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}

	// Ignore errors if JSON is malformed, just return empty
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, fmt.Errorf("failed to parse package.json: %w", err)
	}

	var deps []model.Dependency
	for k, v := range pkg.Dependencies {
		deps = append(deps, model.Dependency{Name: k, Version: v, Type: "production"})
	}
	for k, v := range pkg.DevDependencies {
		deps = append(deps, model.Dependency{Name: k, Version: v, Type: "dev"})
	}
	return deps, nil
}

package service

import (
	"os/exec"
	"regexp"
	"strings"

	"github.com/wabisaby/devkit-dashboard/internal/model"
)

// CheckPrerequisites returns the status of required and optional tools
func CheckPrerequisites() []model.Prerequisite {
	tools := []struct {
		name     string
		required bool
		args     []string
	}{
		{"git", true, []string{"--version"}},
		{"go", true, []string{"version"}},
		{"docker", true, []string{"version", "--format", "{{.Client.Version}}"}},
		{"node", false, []string{"--version"}},
	}

	result := make([]model.Prerequisite, 0, len(tools))
	for _, t := range tools {
		p := checkTool(t.name, t.required, t.args)
		result = append(result, p)
	}
	return result
}

func checkTool(name string, required bool, args []string) model.Prerequisite {
	path, err := exec.LookPath(name)
	if err != nil || path == "" {
		return model.Prerequisite{
			Name:      name,
			Installed: false,
			Required:  required,
			Message:   "not found",
		}
	}

	cmd := exec.Command(name, args...)
	output, err := cmd.CombinedOutput()
	out := strings.TrimSpace(string(output))
	if err != nil {
		return model.Prerequisite{
			Name:      name,
			Installed: true,
			Version:   parseVersion(name, out),
			Required:  required,
			Message:   err.Error(),
		}
	}

	version := parseVersion(name, out)
	if version == "" && out != "" {
		version = firstLine(out)
	}

	return model.Prerequisite{
		Name:      name,
		Installed: true,
		Version:   version,
		Required:  required,
	}
}

func firstLine(s string) string {
	if idx := strings.Index(s, "\n"); idx >= 0 {
		return strings.TrimSpace(s[:idx])
	}
	return strings.TrimSpace(s)
}

var (
	gitVersionRe    = regexp.MustCompile(`git version (\S+)`)
	goVersionRe     = regexp.MustCompile(`go version go(\S+)`)
	nodeVersionRe  = regexp.MustCompile(`v?(\S+)`)
	dockerVersionRe = regexp.MustCompile(`(\d+\.\d+\.\d+)`)
)

func parseVersion(name, output string) string {
	line := firstLine(output)
	switch name {
	case "git":
		if m := gitVersionRe.FindStringSubmatch(line); len(m) > 1 {
			return m[1]
		}
	case "go":
		if m := goVersionRe.FindStringSubmatch(line); len(m) > 1 {
			return m[1]
		}
	case "docker":
		if m := dockerVersionRe.FindStringSubmatch(line); len(m) > 1 {
			return m[1]
		}
	case "node":
		if m := nodeVersionRe.FindStringSubmatch(line); len(m) > 1 {
			return m[1]
		}
	}
	return ""
}

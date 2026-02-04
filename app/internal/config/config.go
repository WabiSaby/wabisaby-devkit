package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// Config holds application configuration for the Wails desktop app
type Config struct {
	DevKitRoot       string
	ProjectsDir      string
	WabisabyCorePath string
}

// defaultDevKitRoot returns the platform-specific app data directory for DevKit.
func defaultDevKitRoot() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dirName := "wabisaby-devkit"
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", dirName), nil
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, dirName), nil
	default:
		dataHome := os.Getenv("XDG_DATA_HOME")
		if dataHome == "" {
			dataHome = filepath.Join(home, ".local", "share")
		}
		return filepath.Join(dataHome, dirName), nil
	}
}

// Load loads configuration from environment variables with defaults
func Load() (*Config, error) {
	var devkitRoot string
	var devkitRootFromEnv bool
	if v := os.Getenv("WABISABY_DEVKIT_ROOT"); v != "" {
		devkitRoot = v
		devkitRootFromEnv = true
	} else {
		var err error
		devkitRoot, err = defaultDevKitRoot()
		if err != nil {
			return nil, err
		}
	}

	projectsDir := os.Getenv("WABISABY_PROJECTS_DIR")
	if !devkitRootFromEnv {
		if root, ok := findDevKitRootFromCwd(); ok {
			devkitRoot = root
		}
	}

	if projectsDir == "" {
		projectsDir = filepath.Join(devkitRoot, "projects")
	}

	// Ensure devkit root and projects dir exist
	if err := os.MkdirAll(projectsDir, 0755); err != nil {
		return nil, err
	}

	// wabisaby-core root: env var, or ProjectsDir/wabisaby-core, or sibling repo
	wabisabyCorePath := os.Getenv("WABISABY_CORE_PATH")
	if wabisabyCorePath == "" {
		projectsCore := filepath.Join(projectsDir, "wabisaby-core")
		if _, err := os.Stat(projectsCore); err == nil {
			wabisabyCorePath = projectsCore
		} else {
			wabisabyCorePath = filepath.Join(filepath.Dir(devkitRoot), "wabisaby-core")
		}
	}

	return &Config{
		DevKitRoot:       devkitRoot,
		ProjectsDir:      projectsDir,
		WabisabyCorePath: wabisabyCorePath,
	}, nil
}

func findDevKitRootFromCwd() (string, bool) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", false
	}

	dir := cwd
	for {
		composePath := filepath.Join(dir, "docker", "docker-compose.yml")
		if _, err := os.Stat(composePath); err == nil {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", false
}

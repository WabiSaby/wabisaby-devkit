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
	AppDataDir       string // Always Application Support; used for auth, never overridden by workspace
	WabisabyCorePath string
	GitHubClientID   string
	GitHubOrg        string
}

const defaultGitHubClientID = "Ov23li37D0pETvomgch9"

const appDataDirName = "wabisaby-devkit"

// appDataDir returns the platform-specific Application Support path for DevKit.
// This is never overridden by workspace detection; use it for auth and user config.
func appDataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", appDataDirName), nil
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, appDataDirName), nil
	default:
		dataHome := os.Getenv("XDG_DATA_HOME")
		if dataHome == "" {
			dataHome = filepath.Join(home, ".local", "share")
		}
		return filepath.Join(dataHome, appDataDirName), nil
	}
}

// defaultDevKitRoot returns the platform-specific app data directory for DevKit.
func defaultDevKitRoot() (string, error) {
	return appDataDir()
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

	// AppDataDir is always Application Support; used for auth, never overridden
	appDataPath, err := appDataDir()
	if err != nil {
		return nil, err
	}

	// Ensure directories exist
	if err := os.MkdirAll(projectsDir, 0755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(appDataPath, 0755); err != nil {
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

	// GitHub integration
	githubClientID := os.Getenv("WABISABY_GITHUB_CLIENT_ID")
	if githubClientID == "" {
		githubClientID = defaultGitHubClientID
	}
	githubOrg := os.Getenv("WABISABY_GITHUB_ORG")
	if githubOrg == "" {
		githubOrg = "WabiSaby"
	}

	return &Config{
		DevKitRoot:       devkitRoot,
		ProjectsDir:      projectsDir,
		AppDataDir:       appDataPath,
		WabisabyCorePath: wabisabyCorePath,
		GitHubClientID:   githubClientID,
		GitHubOrg:        githubOrg,
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

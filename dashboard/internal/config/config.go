package config

import (
	"os"
	"path/filepath"
)

// Default dashboard port when PORT is not set.
const DefaultPort = "8081"

// StartupServerURLFormat is the format for the "server listening" log line (one %s for port).
const StartupServerURLFormat = "Starting DevKit dashboard server on http://localhost:%s"

// Config holds application configuration
type Config struct {
	Port           string
	DevKitRoot     string
	WabisabyCorePath string
	StaticDir      string
}

// Load loads configuration from environment variables with defaults
func Load() (*Config, error) {

	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	devkitRoot := filepath.Dir(wd)

	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	staticDir := "static"
	if _, err := os.Stat("static"); err != nil {
		staticDir = "."
	}

	// wabisaby-core root: env var, or DevKit projects/wabisaby-core, or sibling repo
	wabisabyCorePath := os.Getenv("WABISABY_CORE_PATH")
	if wabisabyCorePath == "" {
		projectsCore := filepath.Join(devkitRoot, "projects", "wabisaby-core")
		if _, err := os.Stat(projectsCore); err == nil {
			wabisabyCorePath = projectsCore
		} else {
			wabisabyCorePath = filepath.Join(filepath.Dir(devkitRoot), "wabisaby-core")
		}
	}

	return &Config{
		Port:             port,
		DevKitRoot:       devkitRoot,
		WabisabyCorePath: wabisabyCorePath,
		StaticDir:      staticDir,
	}, nil
}

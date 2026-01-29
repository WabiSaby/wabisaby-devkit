package config

import (
	"os"
	"path/filepath"
)

// Config holds application configuration
type Config struct {
	Port       string
	DevKitRoot string
	StaticDir  string
}

// Load loads configuration from environment variables with defaults
func Load() (*Config, error) {
	// Get DevKit root (parent of ui directory)
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	devkitRoot := filepath.Dir(wd)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	staticDir := "static"
	if _, err := os.Stat("static"); err != nil {
		staticDir = "."
	}

	return &Config{
		Port:       port,
		DevKitRoot: devkitRoot,
		StaticDir:  staticDir,
	}, nil
}

package service

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/wabisaby/devkit-dashboard/internal/config"
	"github.com/wabisaby/devkit-dashboard/internal/model"
)

// EnvService manages .env configuration
type EnvService struct {
	wabisabyRoot string
}

// NewEnvService creates a new environment service
func NewEnvService(wabisabyRoot string) *EnvService {
	return &EnvService{
		wabisabyRoot: wabisabyRoot,
	}
}

// GetStatus returns the current environment configuration status
func (s *EnvService) GetStatus() (*model.EnvStatus, error) {
	status := &model.EnvStatus{
		RequiredVars: []model.EnvVar{},
		OptionalVars: []model.EnvVar{},
	}

	envPath := filepath.Join(s.wabisabyRoot, ".env")
	examplePath := filepath.Join(s.wabisabyRoot, "env.example")

	// Check if files exist
	if _, err := os.Stat(envPath); err == nil {
		status.HasEnvFile = true
	}
	if _, err := os.Stat(examplePath); err == nil {
		status.HasExample = true
	}

	// Read current env vars
	setVars := make(map[string]bool)
	if status.HasEnvFile {
		vars, err := s.parseEnvFile(envPath)
		if err == nil {
			for k := range vars {
				setVars[k] = true
			}
		}
	}

	// Build required vars list
	for _, name := range config.RequiredEnvVars() {
		status.RequiredVars = append(status.RequiredVars, model.EnvVar{
			Name:     name,
			IsSet:    setVars[name],
			Required: true,
		})
	}

	// Build optional vars list
	for _, name := range config.OptionalEnvVars() {
		status.OptionalVars = append(status.OptionalVars, model.EnvVar{
			Name:     name,
			IsSet:    setVars[name],
			Required: false,
		})
	}

	return status, nil
}

// CopyExample copies env.example to .env
func (s *EnvService) CopyExample() error {
	examplePath := filepath.Join(s.wabisabyRoot, "env.example")
	envPath := filepath.Join(s.wabisabyRoot, ".env")

	// Check if example exists
	if _, err := os.Stat(examplePath); err != nil {
		return fmt.Errorf("env.example not found")
	}

	// Check if .env already exists
	if _, err := os.Stat(envPath); err == nil {
		return fmt.Errorf(".env already exists - remove it first to copy from example")
	}

	// Copy file
	src, err := os.Open(examplePath)
	if err != nil {
		return fmt.Errorf("failed to open env.example: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(envPath)
	if err != nil {
		return fmt.Errorf("failed to create .env: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	return nil
}

// Validate checks if all required environment variables are set
func (s *EnvService) Validate() ([]string, error) {
	envPath := filepath.Join(s.wabisabyRoot, ".env")

	// Check if .env exists
	if _, err := os.Stat(envPath); err != nil {
		return config.RequiredEnvVars(), fmt.Errorf(".env file not found")
	}

	// Parse .env
	vars, err := s.parseEnvFile(envPath)
	if err != nil {
		return nil, fmt.Errorf("failed to parse .env: %w", err)
	}

	// Check required vars
	var missing []string
	for _, name := range config.RequiredEnvVars() {
		if _, ok := vars[name]; !ok {
			missing = append(missing, name)
		}
	}

	return missing, nil
}

// parseEnvFile parses an env file and returns a map of var names to whether they're set
func (s *EnvService) parseEnvFile(path string) (map[string]bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	vars := make(map[string]bool)
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			name := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			// Consider it set if there's a non-empty value
			vars[name] = value != ""
		}
	}

	return vars, nil
}

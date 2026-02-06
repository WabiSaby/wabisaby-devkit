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
		CustomVars:   []model.EnvVar{},
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

	// Read current env vars with their values
	envVars := make(map[string]string)
	if status.HasEnvFile {
		vars, err := s.parseEnvFileValues(envPath)
		if err == nil {
			envVars = vars
		}
	}

	known := config.KnownEnvVars()

	// Build required vars list
	for _, name := range config.RequiredEnvVars() {
		value, isSet := envVars[name]
		status.RequiredVars = append(status.RequiredVars, model.EnvVar{
			Name:      name,
			Value:     value,
			IsSet:     isSet && value != "",
			Required:  true,
			Sensitive: config.IsSensitiveVar(name),
		})
	}

	// Build optional vars list
	for _, name := range config.OptionalEnvVars() {
		value, isSet := envVars[name]
		status.OptionalVars = append(status.OptionalVars, model.EnvVar{
			Name:      name,
			Value:     value,
			IsSet:     isSet && value != "",
			Required:  false,
			Sensitive: config.IsSensitiveVar(name),
		})
	}

	// Build custom vars list (vars in .env that aren't in required/optional)
	for name, value := range envVars {
		if !known[name] {
			status.CustomVars = append(status.CustomVars, model.EnvVar{
				Name:      name,
				Value:     value,
				IsSet:     value != "",
				Required:  false,
				Sensitive: config.IsSensitiveVar(name),
			})
		}
	}

	return status, nil
}

// UpdateVar updates or adds an environment variable in the .env file.
// If the variable exists, its value is replaced in-place preserving file structure.
// If the variable does not exist, it is appended to the end.
func (s *EnvService) UpdateVar(name, value string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("variable name cannot be empty")
	}

	envPath := filepath.Join(s.wabisabyRoot, ".env")

	// If .env doesn't exist, create it with just this variable
	if _, err := os.Stat(envPath); err != nil {
		return os.WriteFile(envPath, []byte(name+"="+value+"\n"), 0644)
	}

	data, err := os.ReadFile(envPath)
	if err != nil {
		return fmt.Errorf("failed to read .env: %w", err)
	}

	lines := strings.Split(string(data), "\n")
	found := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		parts := strings.SplitN(trimmed, "=", 2)
		if len(parts) >= 1 && strings.TrimSpace(parts[0]) == name {
			lines[i] = name + "=" + value
			found = true
			break
		}
	}

	if !found {
		// Append to end, ensuring there's a newline before if needed
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			// File already ends with newline, insert before trailing empty
			lines = append(lines[:len(lines)-1], name+"="+value, "")
		} else {
			lines = append(lines, name+"="+value)
		}
	}

	output := strings.Join(lines, "\n")
	return os.WriteFile(envPath, []byte(output), 0644)
}

// DeleteVar removes an environment variable from the .env file.
func (s *EnvService) DeleteVar(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("variable name cannot be empty")
	}

	envPath := filepath.Join(s.wabisabyRoot, ".env")

	data, err := os.ReadFile(envPath)
	if err != nil {
		return fmt.Errorf("failed to read .env: %w", err)
	}

	lines := strings.Split(string(data), "\n")
	var result []string
	found := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			parts := strings.SplitN(trimmed, "=", 2)
			if len(parts) >= 1 && strings.TrimSpace(parts[0]) == name {
				found = true
				continue // skip this line
			}
		}
		result = append(result, line)
	}

	if !found {
		return fmt.Errorf("variable %s not found in .env", name)
	}

	output := strings.Join(result, "\n")
	return os.WriteFile(envPath, []byte(output), 0644)
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
	vars, err := s.parseEnvFileValues(envPath)
	if err != nil {
		return nil, fmt.Errorf("failed to parse .env: %w", err)
	}

	// Check required vars
	var missing []string
	for _, name := range config.RequiredEnvVars() {
		if val, ok := vars[name]; !ok || val == "" {
			missing = append(missing, name)
		}
	}

	return missing, nil
}

// parseEnvFileValues parses an env file and returns a map of var names to values
func (s *EnvService) parseEnvFileValues(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	vars := make(map[string]string)
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
			vars[name] = value
		}
	}

	return vars, nil
}

package service

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// CheckServiceStatus checks if a Docker service is running
func CheckServiceStatus(name string, port int, devkitRoot string) string {
	// Map service names to Docker container names
	containerMap := map[string]string{
		"PostgreSQL":     "wabisaby-postgres",
		"Redis":          "wabisaby-redis",
		"RedisCommander": "wabisaby-redis-commander",
		"MinIO":          "wabisaby-minio",
		"Vault":          "wabisaby-vault",
		"pgAdmin":        "wabisaby-pgadmin",
		"Keycloak":       "wabisaby-keycloak",
	}

	containerName, ok := containerMap[name]
	if !ok {
		return "unknown"
	}

	// Check if container is running
	cmd := exec.Command("docker", "ps", "--filter", fmt.Sprintf("name=%s", containerName), "--format", "{{.Status}}")
	output, err := cmd.Output()
	if err != nil {
		return "stopped"
	}

	if len(output) > 0 {
		return "running"
	}
	return "stopped"
}

// StartService starts a Docker service
func StartService(name string, devkitRoot string) error {
	serviceMap := map[string]string{
		"PostgreSQL":     "postgres",
		"Redis":          "redis",
		"RedisCommander": "redis-commander",
		"MinIO":          "minio",
		"Vault":          "vault",
		"pgAdmin":        "pgadmin",
		"Keycloak":       "keycloak",
	}

	composeServiceName, ok := serviceMap[name]
	if !ok {
		composeServiceName = strings.ToLower(name)
	}

	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")
	cmd := exec.Command("docker-compose", "-f", composeFile, "up", "-d", composeServiceName)
	if err := cmd.Run(); err != nil {
		return err
	}

	// Ensure companion UIs are started alongside base services.
	if name == "PostgreSQL" {
		_ = exec.Command("docker-compose", "-f", composeFile, "up", "-d", "pgadmin").Run()
	}
	if name == "Redis" {
		_ = exec.Command("docker-compose", "-f", composeFile, "up", "-d", "redis-commander").Run()
	}

	return nil
}

// StopService stops a Docker service
func StopService(name string, devkitRoot string) error {
	serviceMap := map[string]string{
		"PostgreSQL":     "postgres",
		"Redis":          "redis",
		"RedisCommander": "redis-commander",
		"MinIO":          "minio",
		"Vault":          "vault",
		"pgAdmin":        "pgadmin",
		"Keycloak":       "keycloak",
	}

	composeServiceName, ok := serviceMap[name]
	if !ok {
		composeServiceName = strings.ToLower(name)
	}

	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")
	cmd := exec.Command("docker-compose", "-f", composeFile, "stop", composeServiceName)
	if err := cmd.Run(); err != nil {
		return err
	}

	// Stop companion UIs when base services are stopped.
	if name == "PostgreSQL" {
		_ = exec.Command("docker-compose", "-f", composeFile, "stop", "pgadmin").Run()
	}
	if name == "Redis" {
		_ = exec.Command("docker-compose", "-f", composeFile, "stop", "redis-commander").Run()
	}

	return nil
}

// StartAllServices starts all Docker services
func StartAllServices(devkitRoot string) error {
	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")
	cmd := exec.Command("docker-compose", "-f", composeFile, "up", "-d")
	return cmd.Run()
}

// StopAllServices stops all Docker services
func StopAllServices(devkitRoot string) error {
	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")
	cmd := exec.Command("docker-compose", "-f", composeFile, "down")
	return cmd.Run()
}

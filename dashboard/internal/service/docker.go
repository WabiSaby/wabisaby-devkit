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
		"PostgreSQL": "wabisaby-postgres",
		"Redis":      "wabisaby-redis",
		"MinIO":      "wabisaby-minio",
		"Vault":      "wabisaby-vault",
		"pgAdmin":    "wabisaby-pgadmin",
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
		"PostgreSQL": "postgres",
		"Redis":      "redis",
		"MinIO":      "minio",
		"Vault":      "vault",
		"pgAdmin":    "pgadmin",
	}

	composeServiceName, ok := serviceMap[name]
	if !ok {
		composeServiceName = strings.ToLower(name)
	}

	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")
	cmd := exec.Command("docker-compose", "-f", composeFile, "up", "-d", composeServiceName)
	return cmd.Run()
}

// StopService stops a Docker service
func StopService(name string, devkitRoot string) error {
	serviceMap := map[string]string{
		"PostgreSQL": "postgres",
		"Redis":      "redis",
		"MinIO":      "minio",
		"Vault":      "vault",
		"pgAdmin":    "pgadmin",
	}

	composeServiceName, ok := serviceMap[name]
	if !ok {
		composeServiceName = strings.ToLower(name)
	}

	composeFile := filepath.Join(devkitRoot, "docker/docker-compose.yml")
	cmd := exec.Command("docker-compose", "-f", composeFile, "stop", composeServiceName)
	return cmd.Run()
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

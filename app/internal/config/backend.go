package config

import "strings"

// BackendServiceConfig defines a WabiSaby-Go service
type BackendServiceConfig struct {
	Name       string
	CmdPath    string // e.g., "./cmd/api"
	Group      string // "backend", "mesh", "plugins"
	Port       int
	HealthPath string // e.g., "/health"
	DocsPath   string // e.g., "/docs"
}

// GetBackendServices returns all configured WabiSaby-Go services
func GetBackendServices() []BackendServiceConfig {
	return []BackendServiceConfig{
		// Backend services (core.yaml)
		{
			Name:       "api",
			CmdPath:    "./cmd/api",
			Group:      "backend",
			Port:       8080,
			HealthPath: "/health",
			DocsPath:   "/docs",
		},
		{
			Name:    "websocket",
			CmdPath: "./cmd/websocket",
			Group:   "backend",
			Port:    8081,
		},

		// WabiSaby Mesh (coordinator.yaml)
		{
			Name:    "network-coordinator",
			CmdPath: "./cmd/network-coordinator",
			Group:   "mesh",
			Port:    50051,
		},

		// Node (node.yaml)
		{
			Name:    "node",
			CmdPath: "./cmd/node",
			Group:   "mesh",
		},

		// Plugin infrastructure
		{
			Name:    "capabilities-server",
			CmdPath: "./cmd/capabilities-server",
			Group:   "plugins",
			Port:    50051,
		},
		{
			Name:    "stateful-plugin-worker",
			CmdPath: "./cmd/stateful-plugin-worker",
			Group:   "plugins",
		},
		{
			Name:    "stateless-plugin-worker",
			CmdPath: "./cmd/stateless-plugin-worker",
			Group:   "plugins",
		},
	}
}

// GetServiceByName returns a service config by name
func GetServiceByName(name string) *BackendServiceConfig {
	for _, svc := range GetBackendServices() {
		if svc.Name == name {
			return &svc
		}
	}
	return nil
}

// GetServicesByGroup returns all services in a group
func GetServicesByGroup(group string) []BackendServiceConfig {
	var services []BackendServiceConfig
	for _, svc := range GetBackendServices() {
		if svc.Group == group {
			services = append(services, svc)
		}
	}
	return services
}

// RequiredEnvVars returns the list of required environment variables
func RequiredEnvVars() []string {
	return []string{
		"DATABASE_URL",
		"REDIS_URL",
		"JWT_SECRET",
	}
}

// OptionalEnvVars returns common optional environment variables
func OptionalEnvVars() []string {
	return []string{
		"PORT",
		"WEBSOCKET_PORT",
		"CAPABILITIES_PORT",
		"STORAGE_ENDPOINT",
		"STORAGE_ACCESS_KEY",
		"STORAGE_SECRET_KEY",
		"STORAGE_BUCKET",
		"WABISABY_VAULT_ENABLED",
		"WABISABY_VAULT_ADDRESS",
		"WABISABY_KEYCLOAK_BASE_URL",
		"WABISABY_KEYCLOAK_REALM",
	}
}

// SensitiveEnvVars returns a set of known sensitive variable names
func SensitiveEnvVars() map[string]bool {
	return map[string]bool{
		"JWT_SECRET":         true,
		"DATABASE_URL":       true,
		"REDIS_URL":          true,
		"STORAGE_ACCESS_KEY": true,
		"STORAGE_SECRET_KEY": true,
	}
}

// IsSensitiveVar returns true if the variable name is classified as sensitive.
// It checks the known list first, then falls back to a heuristic that matches
// common secret-related keywords in the variable name.
func IsSensitiveVar(name string) bool {
	if SensitiveEnvVars()[name] {
		return true
	}
	// Heuristic: flag vars containing common secret keywords
	upper := strings.ToUpper(name)
	for _, keyword := range []string{"SECRET", "PASSWORD", "TOKEN", "PRIVATE_KEY"} {
		if strings.Contains(upper, keyword) {
			return true
		}
	}
	return false
}

// KnownEnvVars returns a set of all known (required + optional) variable names
func KnownEnvVars() map[string]bool {
	known := make(map[string]bool)
	for _, name := range RequiredEnvVars() {
		known[name] = true
	}
	for _, name := range OptionalEnvVars() {
		known[name] = true
	}
	return known
}

package config

// BackendServiceConfig defines a WabiSaby-Go service
type BackendServiceConfig struct {
	Name       string
	CmdPath    string // e.g., "./cmd/api"
	Group      string // "core", "coordinator", "node"
	Port       int
	HealthPath string // e.g., "/health"
	DocsPath   string // e.g., "/docs"
}

// GetBackendServices returns all configured WabiSaby-Go services
func GetBackendServices() []BackendServiceConfig {
	return []BackendServiceConfig{
		// Core services (core.yaml)
		{
			Name:       "api",
			CmdPath:    "./cmd/api",
			Group:      "core",
			Port:       8080,
			HealthPath: "/health",
			DocsPath:   "/docs",
		},
		{
			Name:    "websocket",
			CmdPath: "./cmd/websocket",
			Group:   "core",
			Port:    8081,
		},
		{
			Name:    "capabilities-server",
			CmdPath: "./cmd/capabilities-server",
			Group:   "core",
			Port:    50051,
		},
		{
			Name:    "stateful-plugin-worker",
			CmdPath: "./cmd/stateful-plugin-worker",
			Group:   "core",
		},
		{
			Name:    "stateless-plugin-worker",
			CmdPath: "./cmd/stateless-plugin-worker",
			Group:   "core",
		},

		// Coordinator (coordinator.yaml)
		{
			Name:    "network-coordinator",
			CmdPath: "./cmd/network-coordinator",
			Group:   "coordinator",
			Port:    50051,
		},

		// Node (node.yaml)
		{
			Name:    "node",
			CmdPath: "./cmd/node",
			Group:   "node",
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
		"WABISABY_SUPABASE_URL",
	}
}

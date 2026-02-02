package model

// BackendService represents a WabiSaby-Go service
type BackendService struct {
	Name      string `json:"name"`
	Group     string `json:"group"`           // "core", "coordinator", "node"
	Port      int    `json:"port,omitempty"`
	Status    string `json:"status"`          // "running", "stopped", "starting", "stopping", "error"
	PID       int    `json:"pid,omitempty"`
	HealthURL string `json:"healthUrl,omitempty"`
	DocsURL   string `json:"docsUrl,omitempty"`
	Error     string `json:"error,omitempty"`
}

// MigrationStatus represents database migration state
type MigrationStatus struct {
	CurrentVersion uint        `json:"currentVersion"`
	Dirty          bool        `json:"dirty"`
	Migrations     []Migration `json:"migrations"`
	Error          string      `json:"error,omitempty"`
}

// Migration represents a single migration file
type Migration struct {
	Version uint   `json:"version"`
	Name    string `json:"name"`
	Applied bool   `json:"applied"`
}

// EnvStatus represents environment configuration state
type EnvStatus struct {
	HasEnvFile   bool     `json:"hasEnvFile"`
	HasExample   bool     `json:"hasExample"`
	RequiredVars []EnvVar `json:"requiredVars"`
	OptionalVars []EnvVar `json:"optionalVars"`
}

// EnvVar represents an environment variable (value hidden for security)
type EnvVar struct {
	Name     string `json:"name"`
	IsSet    bool   `json:"isSet"`
	Required bool   `json:"required"`
}

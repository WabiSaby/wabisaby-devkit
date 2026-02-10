package model

// BackendService represents a WabiSaby-Go service
type BackendService struct {
	Name       string   `json:"name"`
	Group      string   `json:"group"` // "backend", "mesh", "plugins"
	Port       int      `json:"port,omitempty"`
	Status     string   `json:"status"` // "running", "stopped", "starting", "stopping", "error"
	PID        int      `json:"pid,omitempty"`
	HealthURL  string   `json:"healthUrl,omitempty"`
	DocsURL    string   `json:"docsUrl,omitempty"`
	Error      string   `json:"error,omitempty"`
	LastOutput []string `json:"lastOutput,omitempty"` // last stdout/stderr lines when in error state
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
	CustomVars   []EnvVar `json:"customVars"`
}

// EnvVar represents an environment variable
type EnvVar struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	IsSet     bool   `json:"isSet"`
	Required  bool   `json:"required"`
	Sensitive bool   `json:"sensitive"`
}

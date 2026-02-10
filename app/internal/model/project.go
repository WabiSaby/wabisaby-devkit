package model

// Project represents a WabiSaby project
type Project struct {
	Name     string `json:"name"`
	Branch   string `json:"branch"`
	Commit   string `json:"commit"`
	Dirty    bool   `json:"dirty"`
	Status   string `json:"status"`
	Language string `json:"language,omitempty"`
	RepoURL  string `json:"repoUrl,omitempty"` // GitHub repo URL for the project card link
}

// Dependency represents a project dependency
type Dependency struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Type    string `json:"type"` // "direct", "indirect", "production", "dev"
}

// Response represents a generic API response
type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

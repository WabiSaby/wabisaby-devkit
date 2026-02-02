package model

// Service represents a Docker service
type Service struct {
	Name   string `json:"name"`
	Port   int    `json:"port"`
	Status string `json:"status"`
	URL    string `json:"url,omitempty"` // Web UI URL when applicable (pgAdmin, MinIO Console, Vault UI)
}

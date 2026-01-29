package model

// Service represents a Docker service
type Service struct {
	Name   string `json:"name"`
	Port   int    `json:"port"`
	Status string `json:"status"`
}

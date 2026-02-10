package model

// ProtoStatus represents protobuf codegen status
type ProtoStatus struct {
	OutOfDate  bool   `json:"outOfDate"`
	Message    string `json:"message"`
	ProtosPath string `json:"protosPath,omitempty"`
}

// Notice represents a dashboard notice (sync, proto, migration, env, docker)
type Notice struct {
	ID        string `json:"id"`
	Severity  string `json:"severity"` // "info", "warn", "error"
	Message   string `json:"message"`
	ActionKey string `json:"actionKey,omitempty"` // "sync", "proto", "env", "migration", "docker"
}

// Prerequisite represents a required or optional tool
type Prerequisite struct {
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Required  bool   `json:"required"`
	Message   string `json:"message,omitempty"`
}

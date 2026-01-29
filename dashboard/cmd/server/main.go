package main

import (
	"log"
	"net/http"

	"github.com/wabisaby/devkit-dashboard/internal/config"
	"github.com/wabisaby/devkit-dashboard/internal/handler"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Create handlers
	projectHandler := handler.NewProjectHandler(cfg.DevKitRoot)
	serviceHandler := handler.NewServiceHandler(cfg.DevKitRoot)

	// Create router
	router := NewRouter(projectHandler, serviceHandler, cfg.StaticDir)

	// Start server
	log.Printf("Starting DevKit dashboard server on http://localhost:%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, router))
}

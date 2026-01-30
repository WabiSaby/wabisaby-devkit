package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/wabisaby/devkit-dashboard/internal/config"
	"github.com/wabisaby/devkit-dashboard/internal/handler"
	"github.com/wabisaby/devkit-dashboard/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	projectHandler := handler.NewProjectHandler(cfg.DevKitRoot)
	serviceHandler := handler.NewServiceHandler(cfg.DevKitRoot)

	processManager := service.NewProcessManager(cfg.WabisabyCorePath)
	migrationSvc := service.NewMigrationService(cfg.WabisabyCorePath)
	envSvc := service.NewEnvService(cfg.WabisabyCorePath)
	backendHandler := handler.NewBackendHandler(processManager, migrationSvc, envSvc, cfg.WabisabyCorePath)

	router := NewRouter(projectHandler, serviceHandler, backendHandler, cfg.StaticDir)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Shutting down, stopping all backend services...")

		processManager.StopAll()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf(config.StartupServerURLFormat, cfg.Port)
	log.Printf("wabisaby-core path: %s", cfg.WabisabyCorePath)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}

	log.Println("Server stopped")
}

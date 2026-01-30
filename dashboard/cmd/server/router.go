package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/wabisaby/devkit-dashboard/internal/handler"
)

// NewRouter creates a new Chi router with all routes configured
func NewRouter(projectHandler *handler.ProjectHandler, serviceHandler *handler.ServiceHandler, backendHandler *handler.BackendHandler, staticDir string) http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Status endpoint
	r.Get("/api/status", func(w http.ResponseWriter, r *http.Request) {
		handler.SendSuccess(w, map[string]string{"message": "DevKit dashboard is running"})
	})

	// Submodule sync
	r.Get("/api/submodule/sync-status", projectHandler.HandleSubmoduleSyncStatus)
	r.Post("/api/submodule/sync", projectHandler.HandleSubmoduleSync)

	// API routes
	r.Route("/api/projects", func(r chi.Router) {
		r.Get("/", projectHandler.ListProjects)
		r.Post("/{name}/clone", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/update", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/test", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/build", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/format", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/lint", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/open", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Post("/{name}/tag", projectHandler.HandleCreateTag)
		r.Get("/{name}/tags", projectHandler.HandleListTags)
		r.Get("/{name}/{action}/stream", projectHandler.HandleProjectStream)
		r.Get("/bulk/{action}/stream", projectHandler.HandleBulkStream)
	})

	r.Route("/api/services", func(r chi.Router) {
		r.Get("/", serviceHandler.ListServices)
		r.Post("/all/start", func(w http.ResponseWriter, r *http.Request) {
			serviceHandler.HandleServiceAction(w, r)
		})
		r.Post("/all/stop", func(w http.ResponseWriter, r *http.Request) {
			serviceHandler.HandleServiceAction(w, r)
		})
		r.Post("/{name}/start", func(w http.ResponseWriter, r *http.Request) {
			serviceHandler.HandleServiceAction(w, r)
		})
		r.Post("/{name}/stop", func(w http.ResponseWriter, r *http.Request) {
			serviceHandler.HandleServiceAction(w, r)
		})
		r.Get("/{name}/logs/stream", serviceHandler.HandleServiceLogsStream)
	})

	// Backend (WabiSaby-Go) routes
	r.Route("/api/backend", func(r chi.Router) {
		// Services
		r.Get("/services", backendHandler.ListBackendServices)
		r.Get("/services/{name}/health", backendHandler.CheckHealth)
		r.Post("/services/{name}/start", backendHandler.StartBackendService)
		r.Post("/services/{name}/stop", backendHandler.StopBackendService)
		r.Post("/services/group/{group}/start", backendHandler.StartAllInGroup)
		r.Post("/services/group/{group}/stop", backendHandler.StopAllInGroup)
		r.Get("/services/{name}/logs/stream", backendHandler.StreamServiceLogs)

		// Migrations
		r.Get("/migrations", backendHandler.GetMigrationStatus)
		r.Post("/migrations/up", backendHandler.RunMigrationUp)
		r.Post("/migrations/down", backendHandler.RunMigrationDown)
		r.Get("/migrations/{action}/stream", backendHandler.StreamMigration)

		// Environment
		r.Get("/env", backendHandler.GetEnvStatus)
		r.Post("/env/copy-example", backendHandler.CopyEnvExample)
		r.Get("/env/validate", backendHandler.ValidateEnv)
	})

	// Static files - single source in static/
	r.Get("/*", http.FileServer(http.Dir(staticDir)).ServeHTTP)

	return r
}

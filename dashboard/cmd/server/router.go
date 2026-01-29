package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/wabisaby/devkit-dashboard/internal/handler"
)

// NewRouter creates a new Chi router with all routes configured
func NewRouter(projectHandler *handler.ProjectHandler, serviceHandler *handler.ServiceHandler, staticDir string) http.Handler {
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
		r.Post("/{name}/open", func(w http.ResponseWriter, r *http.Request) {
			projectHandler.HandleProjectAction(w, r)
		})
		r.Get("/{name}/{action}/stream", projectHandler.HandleProjectStream)
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

	// Static files - single source in static/
	r.Get("/*", http.FileServer(http.Dir(staticDir)).ServeHTTP)

	return r
}

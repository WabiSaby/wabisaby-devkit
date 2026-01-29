package handler

import (
	"net/http"
)

// ServeStatic serves static files
func ServeStatic(staticDir string) http.Handler {
	return http.FileServer(http.Dir(staticDir))
}

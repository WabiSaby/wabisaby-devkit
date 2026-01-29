package handler

import (
	"encoding/json"
	"net/http"

	"github.com/wabisaby/devkit-dashboard/internal/model"
)

// SendJSON sends a JSON response
func SendJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// SendError sends an error response
func SendError(w http.ResponseWriter, message string, statusCode int) {
	SendJSON(w, model.Response{
		Success: false,
		Message: message,
	})
	w.WriteHeader(statusCode)
}

// SendSuccess sends a success response
func SendSuccess(w http.ResponseWriter, data interface{}) {
	SendJSON(w, model.Response{
		Success: true,
		Data:    data,
	})
}

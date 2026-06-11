package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
}

type HealthResponse struct {
	Status 		string 		`json:"status"`
	Node 		string 		`json:"node"`
	TimeStamp	 string 	`json:"timestamp"`
	Uptime 		string 		`json:"uptime"`
}

var startTime = time.Now()

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	slog.Debug("health check", "node", s.nodeID, "remote", r.RemoteAddr)

	resp := HealthResponse{
		Status: "ok",
		Node: s.nodeID, 
		TimeStamp: time.Now().Format(time.RFC3339),
		Uptime: time.Since(startTime).Round(time.Second).String(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
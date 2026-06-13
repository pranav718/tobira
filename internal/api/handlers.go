package api

import (
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"time"
)

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/resource", s.handleResource)
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

type LimitResponse struct {
	Allowed bool `json:"allowed"`
	Node string `json:"node"`
	Key string `json:"key"`
	Timestamp string `json:"timestamp"`
}

func (s *Server) handleResource(w http.ResponseWriter, r *http.Request){
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	key := host

	allowed := s.limiter.Allow(key)

	resp:= LimitResponse{
		Allowed: allowed, 
		Node: s.nodeID,
		Key: key,
		Timestamp: time.Now().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")

	if !allowed{
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(resp)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
	
}
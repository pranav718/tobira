package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/pranav718/tobira/internal/gossip"
)

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/resource", s.handleResource)
	mux.HandleFunc("GET /metrics", s.handleMetrics)
	mux.HandleFunc("GET /api/nodes", s.handleNodes)
	mux.HandleFunc("GET /nodes", s.handleNodes)
	mux.HandleFunc("GET /api/gossip/send", s.handleGossipSend)
	mux.HandleFunc("GET /ws", s.wsHub.ServeHTTP)
	mux.HandleFunc("POST /api/admin/gossip", s.handleAdminGossip)
	mux.HandleFunc("POST /api/admin/heartbeat", s.handleAdminHeartbeat)
	mux.HandleFunc("POST /api/admin/shutdown", s.handleAdminShutdown)
	mux.HandleFunc("POST /api/admin/algorithm", s.handleAdminAlgorithm)
}

type HealthResponse struct {
	Status 		string 		`json:"status"`
	Node 		string 		`json:"node"`
	TimeStamp	 string 	`json:"timestamp"`
	Uptime 		string 		`json:"uptime"`
	Algorithm string `json:"algorithm"`
}

var startTime = time.Now()

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if s.gossipNode.IsCrashed() {
		http.Error(w, "node is currently simulated offline", http.StatusServiceUnavailable)
		return
	}
	slog.Debug("health check", "node", s.nodeID, "remote", r.RemoteAddr)

	resp := HealthResponse{
		Status: "ok",
		Node: s.nodeID,
		TimeStamp: time.Now().Format(time.RFC3339),
		Uptime: time.Since(startTime).Round(time.Second).String(),
		Algorithm: s.limiter.Algorithm(),
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

func (s *Server) handleResource(w http.ResponseWriter, r *http.Request) {
	if s.gossipNode.IsCrashed() {
		http.Error(w, "node is currently simulated offline", http.StatusServiceUnavailable)
		return
	}
	start := time.Now()

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	key := host

	allowed := s.limiter.Allow(key)

	s.metrics.Record(allowed, time.Since(start))

	s.wsHub.Broadcast("limit", map[string]interface{}{
		"allowed":   allowed,
		"key":       key,
		"timestamp": time.Now().Format(time.RFC3339),
	})

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

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if s.gossipNode.IsCrashed() {
		http.Error(w, "node is currently simulated offline", http.StatusServiceUnavailable)
		return
	}
	snapshot := s.metrics.Snapshot()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(snapshot)
}

func (s *Server) handleNodes(w http.ResponseWriter, r *http.Request) {
	if s.gossipNode.IsCrashed() {
		http.Error(w, "node is currently simulated offline", http.StatusServiceUnavailable)
		return
	}
	info := s.gossipNode.Info()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(info)
}

 func (s *Server) handleGossipSend(w http.ResponseWriter, r *http.Request) {
	target:= r.URL.Query().Get("target")
	payload:= r.URL.Query().Get("msg")
	if target == "" || payload == "" {
		http.Error(w, "missing 'target' or 'msg' query parameters", http.StatusBadRequest)
		return
	}

	msg:= gossip.Message{
		Type:    "debug",
		Sender:  s.nodeID,
		Payload: payload,
	}

	if err := s.gossipNode.Send(target, msg); err != nil {
		slog.Error("failed to send udp gossip message", "target", target, "err", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return 
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("message sent over UDP"))
}

func (s *Server) handleAdminGossip(w http.ResponseWriter, r *http.Request) {
	mutedStr := r.URL.Query().Get("muted")
	muted := mutedStr == "true"

	s.gossipNode.SetMuteGossip(muted)
	slog.Info("admin: set gossip mute status", "muted", muted, "node", s.nodeID)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf("gossip muted set to %v", muted)))
}

func (s *Server) handleAdminHeartbeat(w http.ResponseWriter, r *http.Request) {
	mutedStr := r.URL.Query().Get("muted")
	muted := mutedStr == "true"

	s.gossipNode.SetMuteHeartbeats(muted)
	slog.Info("admin: set heartbeat mute status", "muted", muted, "node", s.nodeID)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf("heartbeats muted set to %v", muted)))
}

func (s *Server) handleAdminShutdown(w http.ResponseWriter, r *http.Request) {
	slog.Warn("admin: triggering software crash simulation", "node", s.nodeID)
	
	s.gossipNode.SetCrashed(true, 30*time.Second)
	s.wsHub.DisconnectAll()

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("node software crash simulated for 30 seconds"))
}

func (s *Server) handleAdminAlgorithm(w http.ResponseWriter, r *http.Request) {
	algorithm := r.URL.Query().Get("algorithm")
	if algorithm == "" {
		http.Error(w, "missing 'algorithm' query parameter", http.StatusBadRequest)
		return
	}

	if err := s.limiter.Swap(algorithm); err != nil {
		slog.Error("admin: failed to swap algorithm", "algorithm", algorithm, "err", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	slog.Info("admin: algorithm swapped", "algorithm", algorithm, "node", s.nodeID)

	s.wsHub.Broadcast("algorithm_changed", map[string]interface{}{
		"algorithm": algorithm,
		"node":      s.nodeID,
	})

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf("algorithm set to %s", algorithm)))
}
package api

import (
	"encoding/json"
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
	mux.HandleFunc("GET /api/gossip/send", s.handleGossipSend)
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
	start:= time.Now()

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	key := host

	allowed := s.limiter.Allow(key)

	s.metrics.Record(allowed, time.Since(start))

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

func(s *Server) handleMetrics(w http.ResponseWriter, r *http.Request){
	snapshot:= s.metrics.Snapshot()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(snapshot)
}

func (s *Server) handleNodes(w http.ResponseWriter, r *http.Request){
	info:= s.gossipNode.Info()
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
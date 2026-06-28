package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pranav718/tobira/internal/gossip"
	"github.com/pranav718/tobira/internal/limiter"
	"github.com/pranav718/tobira/internal/metrics"
)

func TestAdminHandlers(t *testing.T) {
	met := metrics.NewMetrics()
	gossipNode, err := gossip.NewNode("test-node", "localhost:18081", []string{})
	if err != nil {
		t.Fatalf("failed to create gossip node: %v", err)
	}

	cfg := limiter.Config{
		Algorithm:     "fixed_window",
		Rate:          5,
		WindowSeconds: 2,
		Store:         gossipNode.State(),
		NodeID:        "test-node",
	}
	lim, err := limiter.NewSwappable(cfg)
	if err != nil {
		t.Fatalf("failed to create limiter: %v", err)
	}

	srv := NewServer("test-node", "18081", lim, met, gossipNode)

	if gossipNode.IsGossipMuted() {
		t.Error("expected gossip to be unmuted by default")
	}
	if gossipNode.IsHeartbeatsMuted() {
		t.Error("expected heartbeats to be unmuted by default")
	}

	req := httptest.NewRequest("POST", "/api/admin/gossip?muted=true", nil)
	w := httptest.NewRecorder()
	srv.handleAdminGossip(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if !gossipNode.IsGossipMuted() {
		t.Error("expected gossip to be muted after admin POST")
	}

	req = httptest.NewRequest("POST", "/api/admin/gossip?muted=false", nil)
	w = httptest.NewRecorder()
	srv.handleAdminGossip(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if gossipNode.IsGossipMuted() {
		t.Error("expected gossip to be unmuted after admin POST")
	}

	req = httptest.NewRequest("POST", "/api/admin/heartbeat?muted=true", nil)
	w = httptest.NewRecorder()
	srv.handleAdminHeartbeat(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if !gossipNode.IsHeartbeatsMuted() {
		t.Error("expected heartbeats to be muted after admin POST")
	}

	req = httptest.NewRequest("POST", "/api/admin/heartbeat?muted=false", nil)
	w = httptest.NewRecorder()
	srv.handleAdminHeartbeat(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if gossipNode.IsHeartbeatsMuted() {
		t.Error("expected heartbeats to be unmuted after admin POST")
	}
}

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pranav718/tobira/internal/gossip"
	"github.com/pranav718/tobira/internal/limiter"
	"github.com/pranav718/tobira/internal/metrics"
)

func TestWebSocketHub(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	met := metrics.NewMetrics()
	gossipNode, err := gossip.NewNode("test-node", "localhost:18080", []string{})
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
	lim, err := limiter.New(cfg)
	if err != nil {
		t.Fatalf("failed to create limiter: %v", err)
	}

	srv := NewServer("test-node", "18080", lim, met, gossipNode)
	
	go srv.wsHub.Run(ctx)

	ts := httptest.NewServer(http.HandlerFunc(srv.wsHub.ServeHTTP))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to dial websocket: %v", err)
	}
	defer conn.Close()

	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	
	var msg WSEvent
	_, p, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed to read message: %v", err)
	}
	if err := json.Unmarshal(p, &msg); err != nil {
		t.Fatalf("failed to unmarshal message: %v", err)
	}

	if msg.Event != "metrics" && msg.Event != "gossip" && msg.Event != "health" {
		t.Errorf("expected initial message event to be metrics/gossip, got %s", msg.Event)
	}
	srv.wsHub.Broadcast("limit", map[string]interface{}{
		"allowed": true,
		"key":     "127.0.0.1",
	})

	for i := 0; i < 5; i++ {
		_, p, err = conn.ReadMessage()
		if err != nil {
			t.Fatalf("failed to read message: %v", err)
		}
		if err := json.Unmarshal(p, &msg); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if msg.Event == "limit" {
			break
		}
	}

	if msg.Event != "limit" {
		t.Fatalf("expected limit event, got %s", msg.Event)
	}

	dataMap, ok := msg.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("expected limit data map, got %T", msg.Data)
	}
	if dataMap["allowed"] != true {
		t.Errorf("expected allowed=true, got %v", dataMap["allowed"])
	}
	if dataMap["key"] != "127.0.0.1" {
		t.Errorf("expected key=127.0.0.1, got %v", dataMap["key"])
	}
}

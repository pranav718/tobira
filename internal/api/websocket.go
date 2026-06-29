package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pranav718/tobira/internal/gossip"
	"github.com/pranav718/tobira/internal/metrics"
)

const (
	writeWait = 10 * time.Second

	pongWait = 60 * time.Second

	pingPeriod = (pongWait * 9) / 10

	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true 
	},
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Debug("websocket client closed unexpectedly", "err", err)
			}
			break
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

type Hub struct {
	mu         sync.Mutex
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	metrics    *metrics.Metrics
	gossipNode *gossip.Node
	nodeID     string
}

type WSEvent struct {
	Event string      `json:"event"`
	Node  string      `json:"node"`
	Data  interface{} `json:"data"`
}

func NewHub(nodeID string, gossipNode *gossip.Node, met *metrics.Metrics) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		metrics:    met,
		gossipNode: gossipNode,
		nodeID:     nodeID,
	}
}

func (h *Hub) Broadcast(event string, data interface{}) {
	payload := WSEvent{
		Event: event,
		Node:  h.nodeID,
		Data:  data,
	}
	bytes, err := json.Marshal(payload)
	if err != nil {
		slog.Error("websocket: failed to marshal broadcast payload", "event", event, "err", err)
		return
	}
	
	h.mu.Lock()
	defer h.mu.Unlock()
	
	for client := range h.clients {
		select {
		case client.send <- bytes:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}
}

func (h *Hub) Run(ctx context.Context) {
	slog.Info("starting websocket hub")
	metricsTicker := time.NewTicker(1 * time.Second)
	defer metricsTicker.Stop()

	gossipEvents := h.gossipNode.Events()

	for {
		select {
		case <-ctx.Done():
			slog.Info("stopping websocket hub")
			h.mu.Lock()
			for client := range h.clients {
				close(client.send)
				delete(h.clients, client)
			}
			h.mu.Unlock()
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			slog.Debug("websocket client registered", "count", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			slog.Debug("websocket client unregistered", "count", len(h.clients))

		case <-metricsTicker.C:
			snapshot := h.metrics.Snapshot()
			h.Broadcast("metrics", snapshot)

		case event := <-gossipEvents:
			eventType := "gossip"
			if event.Type == "health_transition" {
				eventType = "health"
			}
			h.Broadcast(eventType, event.Payload)
		}
	}
}

func (h *Hub) DisconnectAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	slog.Warn("websocket: disconnecting all clients due to simulated crash", "node", h.nodeID)
	for client := range h.clients {
		client.conn.Close()
		delete(h.clients, client)
	}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.gossipNode.IsCrashed() {
		http.Error(w, "node is currently simulated offline", http.StatusServiceUnavailable)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "err", err)
		return
	}
	client := &Client{hub: h, conn: conn, send: make(chan []byte, 256)}
	h.register <- client

	go client.writePump()
	go client.readPump()
}

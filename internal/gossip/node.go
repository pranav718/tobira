package gossip

import (
	"context"
	"encoding/json"
	"log/slog"
	"math/rand"
	"net"
	"strings"
	"sync"
	"time"
)

type NodeInfo struct {
	ID    string   `json:"id"`
	Addr  string   `json:"addr"`
	Peers []string `json:"peers"`
	Health map[string]*peerHealth `json:"health"`
}

type peerHealth struct {
	Addr     string    `json:"addr"`
	LastSeen time.Time `json:"last_seen"`
	Status   string    `json:"status"` 
}

type GossipEvent struct {
	Type    string      `json:"type"` // "state_merge" or "health_transition"
	Payload interface{} `json:"payload"`
}

type Node struct {
	mu sync.RWMutex
	id string
	addr string
	peers []string
	transport *Transport
	state *State
	peersHealth map[string]*peerHealth
	eventChan chan GossipEvent
	gossipMuted bool
	heartbeatsMuted bool
}

func NewNode(id, addr string, peers []string) (*Node,error) {
	_, portStr, err:= net.SplitHostPort(addr)
	if err != nil {
		portStr = "8080"
	}

	transport, err := NewTransport(id, portStr)
	if err!=nil {
		return nil, err
	}

	return &Node {
		id: id,
		addr: addr,
		peers: peers,
		transport: transport,
		state:	NewState(),
		peersHealth: make(map[string]*peerHealth),
		eventChan: make(chan GossipEvent, 100),
		gossipMuted: false,
		heartbeatsMuted: false,
	}, nil
}

func (n *Node) SetMuteGossip(mute bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.gossipMuted = mute
}

func (n *Node) IsGossipMuted() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.gossipMuted
}

func (n *Node) SetMuteHeartbeats(mute bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.heartbeatsMuted = mute
}

func (n *Node) IsHeartbeatsMuted() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.heartbeatsMuted
}

func (n *Node) State() *State {
	return n.state
}

func (n *Node) Events() <-chan GossipEvent {
	return n.eventChan
}

func (n *Node) Start(ctx context.Context) {
	go n.receiveLoop()
	go n.startGossipLoop(ctx)
	go n.startHeartbeatLoop(ctx)
	go n.startFailureDetector(ctx)
}

type HeartbeatPayload struct {
	Addr      string `json:"addr"`
	Timestamp int64  `json:"timestamp"`
}

func (n *Node) startHeartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	slog.Info("starting periodic heartbeat loop")

	for {
		select {
		case <-ticker.C:
			if n.IsHeartbeatsMuted() {
				continue
			}
			peers := n.GetPeers()
			if len(peers) == 0 {
				continue
			}

			payload := HeartbeatPayload{
				Addr:      n.addr,
				Timestamp: time.Now().Unix(),
			}
			data, err := json.Marshal(payload)
			if err != nil {
				slog.Error("heartbeat: failed to marshal payload", "err", err)
				continue
			}

			msg := Message{
				Type:    "heartbeat",
				Sender:  n.id,
				Payload: string(data),
			}

			for _, peer := range peers {
				if err := n.Send(peer, msg); err != nil {
					slog.Debug("heartbeat: failed to send to peer", "peer", peer, "err", err)
				}
			}

		case <-ctx.Done():
			slog.Info("heartbeat: stopping loop")
			return
		}
	}
}

func (n *Node) updatePeerHealth(nodeID, addr string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	now := time.Now()
	if ph, exists := n.peersHealth[nodeID]; exists {
		ph.LastSeen = now
		ph.Status = "healthy"
		if ph.Addr == "" && addr != "" {
			ph.Addr = addr
		}
	} else {
		n.peersHealth[nodeID] = &peerHealth{
			Addr:     addr,
			LastSeen: now,
			Status:   "healthy",
		}
		slog.Info("discovered new peer via heartbeat", "id", nodeID, "addr", addr)
	}
}
func (n *Node) startFailureDetector(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	slog.Info("starting periodic failure detector loop")

	for {
		select {
		case <-ticker.C:
			n.checkPeerHealth()

		case <-ctx.Done():
			slog.Info("failure detector: stopping loop")
			return
		}
	}
}

func (n *Node) checkPeerHealth() {
	n.mu.Lock()
	defer n.mu.Unlock()

	now := time.Now()
	for peerID, ph := range n.peersHealth {
		elapsed := now.Sub(ph.LastSeen)

		var newStatus string
		if elapsed > 10*time.Second {
			newStatus = "dead"
		} else if elapsed > 3*time.Second {
			newStatus = "suspect"
		} else {
			newStatus = "healthy"
		}

		if ph.Status != newStatus {
			slog.Warn("peer health transition",
				"id", peerID,
				"old_status", ph.Status,
				"new_status", newStatus,
				"elapsed_seconds", elapsed.Seconds(),
			)
			oldStatus := ph.Status
			ph.Status = newStatus

			select {
			case n.eventChan <- GossipEvent{
				Type: "health_transition",
				Payload: map[string]interface{}{
					"peer_id":    peerID,
					"old_status": oldStatus,
					"new_status": newStatus,
				},
			}:
			default:
			}
		}
	}
}

func (n *Node) Shutdown() error {
	if n.transport != nil{
		return n.transport.Close()
	}
	return nil
}

func (n *Node) Send(targetAddr string, msg Message) error {
	return n.transport.Send(targetAddr, msg)
}

func (n *Node) startGossipLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	slog.Info("starting periodic gossip loop")

	for {
		select {
		case <-ticker.C:
			if n.IsGossipMuted() {
				continue
			}
			peers := n.GetPeers()
			if len(peers) == 0 {
				continue
			}

			targetPeer := peers[r.Intn(len(peers))]
			n.state.Cleanup(120)
			stateSnapshot := n.state.Copy()
			payload, err := json.Marshal(stateSnapshot)
			if err != nil {
				slog.Error("gossip: failed to marshal state snapshot", "err", err)
				continue
			}

			msg := Message{
				Type:    "gossip",
				Sender:  n.id,
				Payload: string(payload),
			}

			slog.Info("gossip: sending state", "from", n.id, "to", targetPeer, "state", string(payload))
			if err := n.Send(targetPeer, msg); err != nil {
				slog.Debug("gossip: failed to send state to peer", "target", targetPeer, "err", err)
			}
			
		case <-ctx.Done():
			slog.Info("gossip: stopping periodic gossip loop")
			return
		}
	}
}

func (n *Node) receiveLoop() {
	slog.Info("starting gossip UDP receive loop")
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for {
		msg, srcAddr, err := n.transport.Read()
		if err != nil {
			if strings.Contains(err.Error(), "use of closed network connection") {
				return
			}
			slog.Error("failed to read UDP packet", "err", err)
			continue
		}

		switch msg.Type {
		case "heartbeat":
			var payload HeartbeatPayload
			if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
				slog.Error("heartbeat: failed to unmarshal payload", "err", err)
				continue
			}
			slog.Debug("heartbeat: received", "sender", msg.Sender, "addr", payload.Addr)
			n.updatePeerHealth(msg.Sender, payload.Addr)

		case "gossip":
			var incoming map[string]map[string]int64
			if err := json.Unmarshal([]byte(msg.Payload), &incoming); err != nil {
				slog.Error("gossip: failed to unmarshal incoming state", "err", err)
				continue
			}

			slog.Info("gossip: received state", "src", srcAddr.String(), "sender", msg.Sender, "state", msg.Payload)

			if changed := n.state.Merge(incoming); changed {
				select {
				case n.eventChan <- GossipEvent{
					Type:    "state_merge",
					Payload: n.state.Copy(),
				}:
				default:
				}
				peers := n.GetPeers()
				var candidates []string
				for _, p := range peers {
					if p != n.addr {
						candidates = append(candidates, p)
					}
				}

				if len(candidates) > 0 {
					forwardTarget := candidates[r.Intn(len(candidates))]
					slog.Info("gossip: forwarding state (fanout)", "forward_to", forwardTarget)
					if err := n.Send(forwardTarget, msg); err != nil {
						slog.Debug("gossip: failed to forward state", "target", forwardTarget, "err", err)
					}
				}
			} else {
				slog.Debug("gossip: state identical, suppressing forwarding")
			}

		default:
			slog.Info("udp: message received",
				"src", srcAddr.String(),
				"type", msg.Type,
				"sender", msg.Sender,
				"payload", msg.Payload,
			)
		}
	}
}

func (n *Node) Info() NodeInfo {
	n.mu.RLock()
	defer n.mu.RUnlock()

	peersCopy := make([]string, len(n.peers))
	copy(peersCopy, n.peers)

	healthCopy := make(map[string]*peerHealth)
	for id, ph := range n.peersHealth {
		healthCopy[id] = &peerHealth{
			Addr:     ph.Addr,
			LastSeen: ph.LastSeen,
			Status:   ph.Status,
		}
	}

	return NodeInfo{
		ID: n.id,
		Addr: n.addr,
		Peers: peersCopy,
		Health: healthCopy,
	}

}

func (n *Node) GetPeers() []string {
	n.mu.RLock()
	defer n.mu.RUnlock()

	peersCopy := make([]string, len(n.peers))
	copy(peersCopy, n.peers)
	return peersCopy
}
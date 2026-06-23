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
}

type Node struct {
	mu sync.RWMutex
	id string
	addr string
	peers []string
	transport *Transport
	state *State
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
	}, nil
}

func (n *Node) Start(ctx context.Context) {
	go n.receiveLoop()
	go n.startGossipLoop(ctx)
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
			peers := n.GetPeers()
			if len(peers) == 0 {
				continue
			}

			targetPeer := peers[r.Intn(len(peers))]
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
		case "gossip":
			var incoming map[string]map[string]int64
			if err := json.Unmarshal([]byte(msg.Payload), &incoming); err != nil {
				slog.Error("gossip: failed to unmarshal incoming state", "err", err)
				continue
			}

			slog.Info("gossip: received state", "src", srcAddr.String(), "sender", msg.Sender, "state", msg.Payload)

			if changed := n.state.Merge(incoming); changed {
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

	return NodeInfo{
		ID: n.id,
		Addr: n.addr,
		Peers: peersCopy,
	}

}

func (n *Node) GetPeers() []string {
	n.mu.RLock()
	defer n.mu.RUnlock()

	peersCopy := make([]string, len(n.peers))
	copy(peersCopy, n.peers)
	return peersCopy
}
package gossip

import (
	"log/slog"
	"net"
	"strings"
	"sync"
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
}

func NewNode(id, addr string, peers []string) (*Node,error) {
	_, postStr, err:= net.SplitHostPort(addr)
	if err != nil {
		postStr = "8080"
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
	}, nil
}

func (n *Node) Start() {
	go n.receiveLoop()
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


func (n *Node) receiveLoop() {
	slog.Info("starting gossip UDP receive loop")
	for {
		msg, srcAddr, err := n.transport.Read()
		if err != nil {
			if strings.Contains(err.Error(), "use of closed network connection") {
				return
			}
			slog.Error("failed to read UDP packet", "err", err)
			continue
		}
		slog.Info("udp: message received",
			"src", srcAddr.String(),
			"type", msg.Type,
			"sender", msg.Sender,
			"payload", msg.Payload,
		)
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
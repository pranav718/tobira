package gossip

import (
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
}

func NewMode(id, addr string, peers []string) *Node {
	return &Node {
		id: id,
		addr: addr,
		peers: peers,
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
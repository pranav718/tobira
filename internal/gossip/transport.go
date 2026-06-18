package gossip

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"strconv"
)

type Message struct {
	Type    string `json:"type"`
	Sender  string `json:"sender"`
	Payload string `json:"payload"`
}

type Transport struct{
	conn net.PacketConn
	nodeId string
}

func NewTransport(nodeID, httpPort string) (*Transport, error) {
	hPort, err := strconv.Atoi(httpPort)
	if err != nil {
		return nil, fmt.Errorf("invalid http port: %v", err)
	}
	udpPort := hPort + 1000
	addr := fmt.Sprintf(":%d", udpPort)
	conn, err := net.ListenPacket("udp", addr)
	if err != nil {
		return nil, fmt.Errorf("failed to bind UDP port %d: %v", udpPort, err)
	}
	slog.Info("udp transport listening", "addr", addr)
	return &Transport{
		conn:   conn,
		nodeID: nodeID,
	}, nil
}


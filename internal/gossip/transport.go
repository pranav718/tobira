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

func (t *Transport) Send(targetHTTPAddr string, msg Message) error {
	host, portStr, err := net.SplitHostPort(targetHTTPAddr)
	if err != nil {
		return fmt.Errorf("invalid target address structure: %v", err)
	}
	hPort, err := strconv.Atoi(portStr)
	if err != nil {
		return fmt.Errorf("invalid target port: %v", err)
	}
	udpPort := hPort + 1000
	targetUDPAddr := fmt.Sprintf("%s:%d", host, udpPort)
	udpAddr, err := net.ResolveUDPAddr("udp", targetUDPAddr)
	if err != nil {
		return fmt.Errorf("failed to resolve UDP address: %v", err)
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}
	_, err = t.conn.WriteTo(data, udpAddr)
	return err
}

func (t *Transport) Read() (Message, net.Addr, error) {
	buf := make([]byte, 65535)
	n, addr, err := t.conn.ReadFrom(buf)
	if err != nil {
		return Message{}, nil, err
	}
	
	var msg Message
	if err := json.Unmarshal(buf[:n], &msg); err != nil {
		return Message{}, addr, fmt.Errorf("failed to unmarshal message: %v", err)
	}
	return msg, addr, nil
}

func (t *Transport) Close() error {
	return t.conn.Close()
}
package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/pranav718/tobira/internal/limiter"
	"github.com/pranav718/tobira/internal/metrics"
	"github.com/pranav718/tobira/internal/gossip"
)

type Server struct {
	nodeID     string
	port       string
	httpServer *http.Server
	limiter    *limiter.SwappableLimiter
	metrics    *metrics.Metrics
	gossipNode *gossip.Node
	wsHub      *Hub
}

func NewServer(nodeID, port string, l *limiter.SwappableLimiter, m *metrics.Metrics, gn *gossip.Node) *Server {
	s := &Server{nodeID: nodeID, port: port, limiter: l, metrics: m, gossipNode: gn}
	s.wsHub = NewHub(nodeID, gn, m)

	mux:= http.NewServeMux()
	s.registerRoutes(mux)

	s.httpServer = &http.Server { 
		Addr: fmt.Sprintf(":%s", port),
		Handler: mux, 
		ReadTimeout: 5* time.Second,
		WriteTimeout: 10* time.Second, 
		IdleTimeout: 30* time.Second,
	}
	return s
	
}

func (s *Server) Start(ctx context.Context) error {
	go s.wsHub.Run(ctx)
	slog.Info("http server listening", "addr", s.httpServer.Addr)
	err := s.httpServer.ListenAndServe()
	if err != nil && err!=http.ErrServerClosed{
		return err
	}
	return nil
}

func (s *Server) Shutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return s.httpServer.Shutdown(ctx)
}
package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

type Server struct {
	nodeID string
	port string
	httpServer *http.Server
}

func NewServer(nodeID, port string) *Server {
	s:= &Server{ nodeID: nodeID, port: port}

	mux:= http.NewServeMux()
	s.registerRoutes(mux)

	s.httpServer = &http.Server { 
		Addr: fmt.Sprintf("%s", port),
		Handler: mux, 
		ReadTimeout: 5* time.Second,
		WriteTimeout: 10* time.Second, 
		IdleTimeout: 30* time.Second,
	}
	return s
	
}
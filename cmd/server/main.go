package main

import (
	"fmt"
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/pranav718/tobira/internal/api"
)

func main() {
	port:= flag.String("port", "8080", "HTTP server port")
	nodeID:= flag.String("id", "node-1", "unique node identifier")
	flag.Parse()

	logger:= slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{ Level: slog.LevelDebug}))
	slog.SetDefault(logger);
	slog.Info("tobira starting", "node", *nodeID, "port", *port)

	
	
}
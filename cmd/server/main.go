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

	ctx, stop:= signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	
	srv:= api.NewServer(*nodeID, *port)

	go func() {
		if err:= srv.Start(); err!=nil {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	slog.Info("tobira ready", "addr", fmt.Sprintf("http://localhost:%s", *port))

	<-ctx.Done()
	slog.Info("shutting down :[ ")

	if err:=srv.Shutdown(); err!=nil{
		slog.Error("shutdown error", "err", err)
		os.Exit(1)
	}

	slog.Info("tobira stopped, gate closed :D ");
}
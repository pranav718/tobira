package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/pranav718/tobira/internal/api"
	"github.com/pranav718/tobira/internal/gossip"
	"github.com/pranav718/tobira/internal/limiter"
	"github.com/pranav718/tobira/internal/metrics"
)

func main() {
	port:= flag.String("port", "8080", "HTTP server port")
	nodeID:= flag.String("id", "node-1", "unique node identifier")
	rate := flag.Int("rate", 10 ,"max reqs per window")
	window:= flag.Int("window", 60, "rate limiter window in seconds")
	algorithm:= flag.String("algorithm","fixed_window","rate limit algorithm: fixed_window, sliding_window, token_bucket, leaky_bucket")
	metricsReset := flag.Int("metrics-reset", 10, "metrics reset interval in seconds( 0 to disable)")
	peers := flag.String("peers", "", "comma-separated list of peer addresses (e.g. localhost:8081,localhost:8082)")
	flag.Parse()

	logger:= slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{ Level: slog.LevelDebug}))
	slog.SetDefault(logger);
	slog.Info("tobira starting", "node", *nodeID, "port", *port, "rate", *rate, "window", *window, "metrics_reset", *metricsReset, "peers", *peers)

	ctx, stop:= signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	met:= metrics.NewMetrics()

	if *metricsReset > 0 {
		ticker:= time.NewTicker(time.Duration(*metricsReset) * time.Second)
		go func() {
			slog.Info("starting metrics reset loop", "interval_seconds", *metricsReset)
			for{
				select{
				case <-ticker.C:
					met.Reset()
					slog.Debug("metrics reset completed")
				case <-ctx.Done():
					ticker.Stop()
					return
				}
			}
		}()
	}

	var peerList []string
	if *peers != "" {
		peerList = strings.Split(*peers, ",")
	}
	selfAddr := fmt.Sprintf("localhost:%s", *port)
	gossipNode, err := gossip.NewNode(*nodeID, selfAddr, peerList)
	if err != nil {
		slog.Error("failed to initialize gossip node", "err", err)
		os.Exit(1)
	}

	gossipNode.Start(ctx)

	lim, err := limiter.NewSwappable(limiter.Config{
		Algorithm:     *algorithm,
		Rate:          *rate,
		WindowSeconds: *window,
		Store:         gossipNode.State(),
		NodeID:        *nodeID,
	})

	if err != nil {
		slog.Error("failed to create limiter", "err", err)
		os.Exit(1)
	}

	srv := api.NewServer(*nodeID, *port, lim, met, gossipNode)

	go func() {
		if err := srv.Start(ctx); err != nil {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	slog.Info("tobira ready", "addr", fmt.Sprintf("http://localhost:%s", *port))
	
	<-ctx.Done()
	slog.Info("shutting down :[")

	if err:= gossipNode.Shutdown(); err!=nil {
		slog.Error("gossip shutdown error", "err", err)
	}

	if err := srv.Shutdown(); err != nil {
		slog.Error("shutdown error", "err", err)
		os.Exit(1)
	}
	slog.Info("tobira stopped, gate closed :D")
}
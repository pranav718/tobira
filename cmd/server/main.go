package main

import (
	"fmt"
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pranav718/tobira/internal/api"
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
	flag.Parse()

	logger:= slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{ Level: slog.LevelDebug}))
	slog.SetDefault(logger);
	slog.Info("tobira starting", "node", *nodeID, "port", *port, "rate", *rate, "window", *window, "metrics_reset", *metricsReset)

	ctx, stop:= signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	lim, err := limiter.New(limiter.Config{
		Algorithm:     *algorithm,
		Rate:          *rate,
		WindowSeconds: *window,
	})

	if err != nil {
		slog.Error("failed to create limiter", "err", err)
		os.Exit(1)
	}

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

	srv := api.NewServer(*nodeID, *port, lim, met)

	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	slog.Info("tobira ready", "addr", fmt.Sprintf("http://localhost:%s", *port))
	
	<-ctx.Done()
	slog.Info("shutting down :[")

	if err := srv.Shutdown(); err != nil {
		slog.Error("shutdown error", "err", err)
		os.Exit(1)
	}
	slog.Info("tobira stopped, gate closed :D")
}
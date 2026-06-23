package limiter

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

type TokenBucket struct {
	capacity    float64
	refillRate  float64
	store       CounterStore
	nodeID      string
	mu          sync.Mutex
	localCounts map[string]int64
	startedAt   map[string]time.Time
}

func NewTokenBucket(cfg Config) *TokenBucket {
	capacity := float64(cfg.Rate)
	refillRate := capacity / float64(cfg.WindowSeconds)
	if refillRate <= 0 {
		refillRate = 1.0
	}
	return &TokenBucket{
		capacity:    capacity,
		refillRate:  refillRate,
		store:       cfg.Store,
		nodeID:      cfg.NodeID,
		localCounts: make(map[string]int64),
		startedAt:   make(map[string]time.Time),
	}
}

func (tb *TokenBucket) Allow(key string) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	start, exists := tb.startedAt[key]
	if !exists {
		start = now
		tb.startedAt[key] = start
	}

	elapsed := now.Sub(start).Seconds()

	// Calculate maximum allowed requests globally
	maxAllowed := tb.capacity + elapsed*tb.refillRate

	allowedKey := fmt.Sprintf("%s:allowed", key)
	globalAllowed := tb.store.GetGlobalCount(allowedKey)

	if float64(globalAllowed) < maxAllowed {
		tb.localCounts[allowedKey]++
		tb.store.UpdateLocal(allowedKey, tb.nodeID, tb.localCounts[allowedKey])

		slog.Debug("limiter: allowed (token_bucket)",
			"key", key,
			"global_allowed", globalAllowed+1,
			"max_allowed", maxAllowed,
		)
		return true
	}

	slog.Debug("limiter: denied (token_bucket)",
		"key", key,
		"global_allowed", globalAllowed,
		"max_allowed", maxAllowed,
	)
	return false
}
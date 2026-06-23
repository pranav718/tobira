package limiter

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

type LeakyBucket struct {
	capacity    float64
	leakRate    float64
	store       CounterStore
	nodeID      string
	mu          sync.Mutex
	localCounts map[string]int64
	startedAt   map[string]time.Time
}

func NewLeakyBucket(cfg Config) *LeakyBucket {
	capacity := float64(cfg.Rate)
	leakRate := capacity / float64(cfg.WindowSeconds)
	if leakRate <= 0 {
		leakRate = 1.0
	}
	return &LeakyBucket{
		capacity:    capacity,
		leakRate:    leakRate,
		store:       cfg.Store,
		nodeID:      cfg.NodeID,
		localCounts: make(map[string]int64),
		startedAt:   make(map[string]time.Time),
	}
}

func (lb *LeakyBucket) Allow(key string) bool {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	now := time.Now()
	start, exists := lb.startedAt[key]
	if !exists {
		start = now
		lb.startedAt[key] = start
	}

	elapsed := now.Sub(start).Seconds()
	waterLeaked := elapsed * lb.leakRate

	allowedKey := fmt.Sprintf("%s:allowed", key)
	globalAllowed := lb.store.GetGlobalCount(allowedKey)

	currentWater := float64(globalAllowed) - waterLeaked
	if currentWater < 0 {
		currentWater = 0
	}

	if currentWater+1.0 <= lb.capacity {
		lb.localCounts[allowedKey]++
		lb.store.UpdateLocal(allowedKey, lb.nodeID, lb.localCounts[allowedKey])

		slog.Debug("limiter: allowed (leaky_bucket)",
			"key", key,
			"water", currentWater+1.0,
			"capacity", lb.capacity,
		)
		return true
	}

	slog.Debug("limiter: denied (leaky_bucket)",
		"key", key,
		"water", currentWater,
		"capacity", lb.capacity,
	)
	return false
}
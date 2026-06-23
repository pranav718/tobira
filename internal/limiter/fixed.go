package limiter

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

type FixedWindow struct {
	rate int
	duration time.Duration
	store CounterStore
	nodeID string
	mu sync.Mutex
	localCounts map[string]int64
}

func NewFixedWindow(cfg Config) *FixedWindow {
	return &FixedWindow{
		rate: cfg.Rate,
		duration: time.Duration(cfg.WindowSeconds) * time.Second,
		store: cfg.Store,
		nodeID: cfg.NodeID,
		localCounts: make(map[string]int64),
	}
}

func (fw *FixedWindow) Allow(key string) bool {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	now := time.Now()
	windowSeconds := int64(fw.duration.Seconds())
	if windowSeconds <= 0 {
		windowSeconds = 1
	}
	currentWindow := now.Unix() / windowSeconds * windowSeconds
	scopedKey := fmt.Sprintf("%s:%d", key, currentWindow)

	globalCount := fw.store.GetGlobalCount(scopedKey)

	if globalCount < int64(fw.rate) {
		fw.localCounts[scopedKey]++
		fw.store.UpdateLocal(scopedKey, fw.nodeID, fw.localCounts[scopedKey])

		slog.Debug("limiter: allowed (fixed_window)",
			"key", key,
			"local_count", fw.localCounts[scopedKey],
			"global_count", globalCount+1,
			"limit", fw.rate,
		)
		return true
	}

	slog.Debug("limiter: denied (fixed_window)",
		"key", key,
		"global_count", globalCount,
		"limit", fw.rate,
	)
	return false
}

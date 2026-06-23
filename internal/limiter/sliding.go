package limiter

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

type SlidingWindow struct {
	rate int
	duration time.Duration
	store CounterStore
	nodeID string
	mu sync.Mutex
	localCounts map[string]int64
}

func NewSlidingWindow(cfg Config) *SlidingWindow {
	return &SlidingWindow{
		rate: cfg.Rate,
		duration: time.Duration(cfg.WindowSeconds) * time.Second,
		store: cfg.Store,
		nodeID: cfg.NodeID,
		localCounts: make(map[string]int64),
	}
}

func (sw *SlidingWindow) Allow(key string) bool {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	now:=time.Now().Unix()
	windowSeconds := int64(sw.duration.Seconds())
	if windowSeconds <= 0 {
		windowSeconds = 1
	}

	var globalCount int64
	for i := int64(0); i < windowSeconds; i++ {
		sliceKey := fmt.Sprintf("%s:slice:%d", key, now-i)
		globalCount += sw.store.GetGlobalCount(sliceKey)
	}

	if globalCount < int64(sw.rate) {
		currentSliceKey := fmt.Sprintf("%s:slice:%d", key, now)
		sw.localCounts[currentSliceKey]++
		sw.store.UpdateLocal(currentSliceKey, sw.nodeID, sw.localCounts[currentSliceKey])

		slog.Debug("limiter: allowed (sliding_window)",
			"key", key,
			"global_count", globalCount+1,
			"limit", sw.rate,
		)
		return true
	}

	slog.Debug("limiter: denied (sliding_window)",
		"key", key,
		"global_count", globalCount,
		"limit", sw.rate,
	)
	return false
	
}
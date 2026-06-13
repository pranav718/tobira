package limiter

import (
	"log/slog"
	"sync"
	"time"
)

type SlidingWindow struct {
	rate int
	duration time.Duration
	mu sync.Mutex
	logs map[string][]time.Time
}

func NewSlidingWindow(cfg Config) *SlidingWindow {
	return &SlidingWindow{ 
		rate: cfg.Rate,
		duration: time.Duration(cfg.WindowSeconds) * time.Second, 
		logs: make(map[string][]time.Time),
	}
}
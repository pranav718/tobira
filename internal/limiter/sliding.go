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

func (sw *SlidingWindow) Allow(key string) bool {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	now:= time.Now()
	cutoff:= now.Add(-sw.duration)

	entries:= sw.logs[key]
	valid:= entries[:0]

	for _, t := range entries {
		if t.After(cutoff){
			valid = append(valid, t)
		}
	}

	if len(valid) < sw.rate {
		sw.logs[key] = append(valid, now)
		slog.Debug("limiter: allowed",
			"algo", "sliding_window",
			"key", key,
			"count", len(valid)+1,
			"limit", sw.rate,
	    )
		return true
	}

	sw.logs[key] = valid
	slog.Debug("limiter: denied",
		"algo", "sliding_window",
		"key", key,
		"count", len(valid),
		"limit", sw.rate,
	)
	return false

}
package limiter

import (
	"log/slog"
	"sync"
	"time"
)

type window struct {
	count int
	expiry time.Time
}

type FixedWindow struct {
	rate int
	duration time.Duration
	mu sync.Mutex
	windows map[string]*window
}

func NewFixedWindow(cfg Config) *FixedWindow {
	return &FixedWindow{
		rate: cfg.Rate,
		duration: time.Duration(cfg.WindowSeconds) * time.Second,
		windows: make(map[string]*window),
	}
}

func (fw *FixedWindow) Allow(key string) bool {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	now:= time.Now()
	w, exists:= fw.windows[key]

	if !exists || now.After(w.expiry) {
		fw.windows[key] = &window{ count: 1, expiry: now.Add(fw.duration)}
		slog.Debug("limiter: new window", 
		"key", key, 
		"count", 1, 
		"expires", fw.windows[key].expiry.Format(time.RFC3339),
		)
		return true
	}

	if w.count < fw.rate {
		w.count++
		slog.Debug("limiter: allowed",
			"key", key,
			"count", w.count,
			"limit", fw.rate,
		)
		return true
	}

	slog.Debug("limiter: denied", "key", key, "count", w.count, "limit", fw.rate)
	return false
}

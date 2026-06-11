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
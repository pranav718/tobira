package limiter

import (
	"log/slog"
	"sync"
	"time"
)

type leak struct {
	water float64
	lastTime time.Time
}

type LeakyBucket struct {
	capacity float64
	leakRate float64
	mu sync.Mutex
	buckets map[string]*leak
}

func NewLeakyBucket(cfg Config) *LeakyBucket {
	capacity := float64(cfg.Rate)
	return &LeakyBucket{
		capacity: capacity, 
		leakRate: capacity / float64(cfg.WindowSeconds),
		buckets: make(map[string]*leak),
	}
}
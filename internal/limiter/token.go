package limiter

import (
	"log/slog"
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	lastTime time.Time
}

type TokenBucket struct {
	capacity float64
	refillRate float64
	mu sync.Mutex
	buckets map[string]*bucket
}

func NewTokenBucket(cfg Config) *TokenBucket{
	capacity:= float64(cfg.Rate)
	return &TokenBucket{
		capacity: capacity,
		refillRate: capacity,
        buckets: make(map[string]*bucket),
	}
}
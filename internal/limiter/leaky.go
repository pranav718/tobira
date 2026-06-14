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

func (lb *LeakyBucket) Allow(key string) bool {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	now := time.Now()
	l, exists := lb.buckets[key]
	if !exists {
		lb.buckets[key] = &leak{
			water:    1, 
			lastTime: now,
		}
		slog.Debug("limiter: allowed",
			"algo", "leaky_bucket",
			"key", key,
			"water", 1.0,
		)
		return true
	}
	elapsed := now.Sub(l.lastTime).Seconds()
	l.water -= elapsed * lb.leakRate
	if l.water < 0 {
		l.water = 0
	}
	l.lastTime = now
	if l.water+1 <= lb.capacity {
		l.water++
		slog.Debug("limiter: allowed",
			"algo", "leaky_bucket",
			"key", key,
			"water", l.water,
		)
		return true
	}
	slog.Debug("limiter: denied",
		"algo", "leaky_bucket",
		"key", key,
		"water", l.water,
	)
	return false
}
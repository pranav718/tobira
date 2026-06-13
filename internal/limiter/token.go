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

func (tb *TokenBucket) Allow(key string) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now:= time.Now()
	b, exists:= tb.buckets[key]

	if !exists{
		tb.buckets[key] = &bucket{
			tokens: tb.capacity - 1,
			lastTime: now,
		}
		slog.Debug("limiter: allowed",
			"algo", "token_bucket",
			"key", key,
			"tokens", tb.capacity-1,
		)
		return true
	}

	elapsed:= now.Sub(b.lastTime).Seconds()
	b.tokens += elapsed * tb.refillRate
	if b.tokens > tb.capacity{
		b.tokens = tb.capacity
	}
	b.lastTime = now

	if b.tokens >=1 {
		b.tokens--
		slog.Debug("limiter: allowed",
			"algo","token_bucket",
			"key", key,
			"tokens", b.tokens,
		)
		return true
	}

	slog.Debug("limiter: denied",
		"algo", "token_bucket",
		"key", key,
		"tokens", b.tokens,
	)

	return false
}
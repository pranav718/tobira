package limiter

import "fmt"

type Limiter interface {
	Allow(key string) bool
}

type CounterStore interface {
	UpdateLocal(key, nodeID string, count int64)
	GetGlobalCount(key string) int64
}

type Config struct {
	Algorithm string
	Rate int
	WindowSeconds int
	Store CounterStore
	NodeID string
}

func New(cfg Config) (Limiter, error) {
	switch cfg.Algorithm{
	case "fixed_window":
		return NewFixedWindow(cfg), nil
	case "sliding_window":
		return NewSlidingWindow(cfg), nil
	case "token_bucket":
		return NewTokenBucket(cfg), nil
	case "leaky_bucket":
		return NewLeakyBucket(cfg), nil
	default:
		return nil, fmt.Errorf("unknown algorithm: %s", cfg.Algorithm)	
	}
}

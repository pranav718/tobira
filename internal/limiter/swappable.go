package limiter

import (
	"fmt"
	"sync"
)

type SwappableLimiter struct {
	mu        sync.RWMutex
	inner     Limiter
	algorithm string
	cfg       Config
}

func NewSwappable(cfg Config) (*SwappableLimiter, error) {
	inner, err := New(cfg)
	if err != nil {
		return nil, err
	}
	return &SwappableLimiter{
		inner:     inner,
		algorithm: cfg.Algorithm,
		cfg:       cfg,
	}, nil
}

func (s *SwappableLimiter) Allow(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.inner.Allow(key)
}

func (s *SwappableLimiter) Swap(algorithm string) error {
	newCfg := s.cfg
	newCfg.Algorithm = algorithm
	newInner, err := New(newCfg)
	if err != nil {
		return fmt.Errorf("swap failed: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.inner = newInner
	s.algorithm = algorithm
	return nil
}

func (s *SwappableLimiter) Algorithm() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.algorithm
}

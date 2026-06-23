package limiter_test

import (
	"sync"
	"testing"

	"github.com/pranav718/tobira/internal/limiter"
)

type mockStore struct {
	mu   sync.RWMutex
	data map[string]int64
}

func (m *mockStore) UpdateLocal(key, nodeID string, count int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = count
}

func (m *mockStore) GetGlobalCount(key string) int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.data[key]
}

func newMockStore() *mockStore {
	return &mockStore{
		data: make(map[string]int64),
	}
}

func BenchmarkLimiters(b *testing.B) {
	algorithms := []string{"fixed_window", "sliding_window", "token_bucket", "leaky_bucket"}

	for _, algo := range algorithms {
		b.Run(algo, func(b *testing.B) {
			store := newMockStore()
			cfg := limiter.Config{
				Algorithm: algo, 
				Rate: 100000,
				WindowSeconds: 10,
				Store:         store,
				NodeID:        "node-1",
			}

			lim, err := limiter.New(cfg)
			if err != nil {
				b.Fatalf("failed to create limiter: %v", err)
			}

			key:= "127.0.0.1"

			b.ReportAllocs()
			b.ResetTimer()

			for i := 0; i<b.N; i++ {
				lim.Allow(key)
			}
		})
	}
}
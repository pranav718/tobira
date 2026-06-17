package limiter_test

import (
	"testing"
	
	"github.com/pranav718/tobira/internal/limiter"
)

func BenchmarkLimiters(b *testing.B){
	algorithms := []string{"fixed_window", "sliding_window", "token_bucket", "leaky_bucket"}

	for _, algo := range algorithms {
		b.Run(algo, func(b *testing.B) {
			cfg := limiter.Config{
				Algorithm: algo, 
				Rate: 100000,
				WindowSeconds: 10,
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
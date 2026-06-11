package limiter

type Limiter interface {
	Allow(key string) bool
}

type Config struct {
	Rate int
	WindowSeconds int
}
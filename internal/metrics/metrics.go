package metrics

import (
	"sync"
	"time"
)

type Metrics struct {
	mu	            sync.RWMutex
	requestsTotal	int64
	allowedTotal	int64
	deniedTotal		int64
	totalLatency	time.Duration
}

type Snapshot struct {
	RequestsTotal    int64   `json:"requests_total"`
	AllowedTotal     int64   `json:"allowed_total"`
	DeniedTotal      int64   `json:"denied_total"`
	AverageLatencyMs float64 `json:"average_latency_ms"`
}

func NewMetrics() *Metrics {
	return &Metrics{}
}

func (m *Metrics) Record(allowed bool, latency time.Duration){
	m.mu.Lock()
	defer m.mu.Unlock()

	m.requestsTotal++
	if allowed {
		m.allowedTotal++
	}else{
		m.deniedTotal++
	}
	m.totalLatency += latency
}

func (m *Metrics) Snapshot() Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var avgLatency float64
	if m.requestsTotal > 0 {
		avgLatency = float64(m.totalLatency.Nanoseconds()) / float64(m.requestsTotal) / 1e6
	}
	return Snapshot{
		RequestsTotal: m.requestsTotal,
		AllowedTotal: m.allowedTotal,
		DeniedTotal: m.deniedTotal,
		AverageLatencyMs: avgLatency,
	}
}

func (m *Metrics) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.requestsTotal = 0
	m.allowedTotal = 0
	m.deniedTotal = 0
	m.totalLatency = 0
}
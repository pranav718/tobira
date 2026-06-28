package gossip 

import (
	"strconv"
	"strings"
	"sync"
	"time"
)

type State struct {
	mu   sync.RWMutex
	Data map[string]map[string]int64 `json:"data"`
}

func NewState() *State {
	return &State{
		Data: make(map[string]map[string]int64),
	}
}

func (s *State) Cleanup(maxAgeSeconds int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().Unix()
	for key := range s.Data {
		idx := strings.LastIndex(key, ":")
		if idx == -1 {
			continue
		}
		suffix := key[idx+1:]
		timestamp, err := strconv.ParseInt(suffix, 10, 64)
		if err == nil {
			if now-timestamp > maxAgeSeconds {
				delete(s.Data, key)
			}
		}
	}
}

func (s *State) UpdateLocal(key, nodeID string, count int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.Data[key]; !exists {
		s.Data[key] = make(map[string]int64)
	}
	s.Data[key][nodeID] = count
}

func (s *State) Merge(incoming map[string]map[string]int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	updated := false
	for key, nodeCounts := range incoming {
		if _, exists := s.Data[key]; !exists {
			s.Data[key] = make(map[string]int64)
			updated = true
		}
		for nodeID, count := range nodeCounts {
			current := s.Data[key][nodeID]
			if count > current {
				s.Data[key][nodeID] = count
				updated = true
			}
		}
	}
	return updated
}

func (s *State) GetGlobalCount(key string) int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	nodeCounts, exists := s.Data[key]
	if !exists {
		return 0
	}
	var total int64
	for _, count := range nodeCounts {
		total += count
	}
	return total
}

func (s *State) Copy() map[string]map[string]int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	copyData := make(map[string]map[string]int64)
	for key, nodeCounts := range s.Data {
		copyData[key] = make(map[string]int64)
		for nodeID, count := range nodeCounts {
			copyData[key][nodeID] = count
		}
	}
	return copyData
}

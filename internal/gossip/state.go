package gossip 

import (
	"sync"
)

type State struct {
	mu sync.RWMutex
	Data map[string]map[string]int64 `json:"data"`
}

func NewState() *State{
	return &State {
		Data: mak(map[string]map[string]int64),
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

func (s *State) Merge(incoming map[string]map[string]int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, nodeCounts := range incoming {
		if _, exists := s.Data[key]; !exists {
			s.Data[key] = make(map[string]int64)
		}
		for nodeID, count := range nodeCounts {
			current := s.Data[key][nodeID]
			if count > current {
				s.Data[key][nodeID] = count
			}
		}
	}
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

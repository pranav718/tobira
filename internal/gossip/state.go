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



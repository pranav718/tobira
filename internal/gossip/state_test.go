package gossip_test

import (
	"testing"

	"github.com/pranav718/tobira/internal/gossip"
)

func TestStateMergeAndConflictResolution(t *testing.T) {
	state1 := gossip.NewState()
	state2 := gossip.NewState()

	state1.UpdateLocal("user-1", "node-1", 10)
	state1.UpdateLocal("user-2", "node-1", 5)

	state2.UpdateLocal("user-1", "node-2", 8)
	state2.UpdateLocal("user-1", "node-1", 3) 


	state1.Merge(state2.Copy())

	globalUser1 := state1.GetGlobalCount("user-1")
	if globalUser1 != 18 { 
		t.Errorf("Expected global count for user-1 to be 18, got %d", globalUser1)
	}

	globalUser2 := state1.GetGlobalCount("user-2")
	if globalUser2 != 5 { 
		t.Errorf("Expected global count for user-2 to be 5, got %d", globalUser2)
	}

	staleState := gossip.NewState()
	staleState.UpdateLocal("user-1", "node-1", 2)
	
	state1.Merge(staleState.Copy())
	globalUser1PostStale := state1.GetGlobalCount("user-1")
	if globalUser1PostStale != 18 {
		t.Errorf("Expected global count to remain 18 after merging stale state, got %d", globalUser1PostStale)
	}
}

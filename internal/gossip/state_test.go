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

func TestStateCleanup(t *testing.T) {
	state := gossip.NewState()

	state.UpdateLocal("user-1:allowed", "node-1", 10)
	state.UpdateLocal("user-2:allowed", "node-2", 5)

	state.UpdateLocal("user-3:1000000000", "node-1", 4)
	state.UpdateLocal("user-4:slice:1000000000", "node-2", 3)

	state.UpdateLocal("user-3:999990000", "node-1", 2)
	state.UpdateLocal("user-4:slice:999990000", "node-2", 1)

	state.UpdateLocal("user-old:1600000000", "node-1", 20)

	state.Cleanup(120) 

	if state.GetGlobalCount("user-old:1600000000") != 0 {
		t.Error("expected expired timestamp-suffixed key to be pruned")
	}

	if state.GetGlobalCount("user-1:allowed") != 10 {
		t.Error("expected non-timestamped key user-1:allowed to be preserved")
	}
}


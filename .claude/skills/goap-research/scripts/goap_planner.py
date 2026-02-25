#!/usr/bin/env python3
"""
GOAP Research Planner - A* Search for Optimal Research Paths

This script implements Goal-Oriented Action Planning for research tasks,
finding optimal sequences of research actions to achieve research goals.
"""

import heapq
import json
from dataclasses import dataclass, field
from typing import Dict, Set, List, Optional, Tuple
from datetime import datetime


@dataclass
class ResearchAction:
    """Represents a research action with preconditions and effects."""
    name: str
    preconditions: Set[str]
    effects: Set[str]
    cost: int
    description: str = ""
    
    def is_applicable(self, state: Set[str]) -> bool:
        """Check if action can be executed in current state."""
        return self.preconditions.issubset(state)
    
    def apply(self, state: Set[str]) -> Set[str]:
        """Apply action to state and return new state."""
        return state.union(self.effects)


@dataclass(order=True)
class PlanNode:
    """Node in the A* search tree."""
    f_cost: float
    g_cost: float = field(compare=False)
    state: Set[str] = field(compare=False)
    actions: List[str] = field(compare=False)
    

# Standard research actions library
RESEARCH_ACTIONS = [
    ResearchAction(
        name="web_search_broad",
        preconditions={"topic_defined"},
        effects={"candidates_found", "subtopics_identified"},
        cost=1,
        description="Initial broad search to identify landscape"
    ),
    ResearchAction(
        name="web_search_specific",
        preconditions={"subtopics_identified"},
        effects={"detail_found", "sources_identified"},
        cost=1,
        description="Targeted search for specific information"
    ),
    ResearchAction(
        name="web_search_expert",
        preconditions={"topic_defined"},
        effects={"authorities_found", "expert_opinions_available"},
        cost=2,
        description="Find domain experts and authoritative sources"
    ),
    ResearchAction(
        name="fetch_source",
        preconditions={"sources_identified"},
        effects={"content_retrieved", "full_context_available"},
        cost=2,
        description="Retrieve full content from identified sources"
    ),
    ResearchAction(
        name="extract_facts",
        preconditions={"content_retrieved"},
        effects={"facts_cataloged", "claims_identified"},
        cost=1,
        description="Extract verifiable claims from content"
    ),
    ResearchAction(
        name="verify_claim",
        preconditions={"claims_identified", "sources_identified"},
        effects={"claims_verified"},
        cost=3,
        description="Verify specific claims against sources"
    ),
    ResearchAction(
        name="cross_reference",
        preconditions={"facts_cataloged", "sources_identified"},
        effects={"consistency_checked", "contradictions_identified"},
        cost=2,
        description="Check consistency across multiple sources"
    ),
    ResearchAction(
        name="find_primary_source",
        preconditions={"claims_identified"},
        effects={"primary_located", "original_source_available"},
        cost=3,
        description="Trace claims to original sources"
    ),
    ResearchAction(
        name="identify_patterns",
        preconditions={"facts_cataloged"},
        effects={"patterns_identified", "themes_emerged"},
        cost=2,
        description="Discover recurring themes and connections"
    ),
    ResearchAction(
        name="timeline_construction",
        preconditions={"facts_cataloged"},
        effects={"chronology_established", "sequence_clear"},
        cost=2,
        description="Establish chronological sequence of events"
    ),
    ResearchAction(
        name="compare_perspectives",
        preconditions={"content_retrieved", "authorities_found"},
        effects={"viewpoints_mapped", "disagreements_clarified"},
        cost=2,
        description="Document different viewpoints on topic"
    ),
    ResearchAction(
        name="synthesize_findings",
        preconditions={"claims_verified", "patterns_identified"},
        effects={"conclusions_formed", "confidence_assigned"},
        cost=3,
        description="Integrate research into coherent conclusions"
    ),
    ResearchAction(
        name="generate_report",
        preconditions={"conclusions_formed"},
        effects={"report_delivered", "research_complete"},
        cost=2,
        description="Produce structured research output"
    ),
]


def heuristic(state: Set[str], goal: Set[str]) -> float:
    """
    Estimate cost to reach goal from current state.
    Uses count of unachieved goal conditions.
    """
    missing = goal - state
    return len(missing) * 1.5  # Weighted by average action cost


def find_research_plan(
    initial_state: Set[str],
    goal_state: Set[str],
    actions: List[ResearchAction] = None,
    max_iterations: int = 1000
) -> Optional[Tuple[List[str], float, List[Set[str]]]]:
    """
    A* search to find optimal research plan.
    
    Returns:
        Tuple of (action_sequence, total_cost, state_progression) or None if no plan found
    """
    if actions is None:
        actions = RESEARCH_ACTIONS
    
    # Check if goal already satisfied
    if goal_state.issubset(initial_state):
        return ([], 0.0, [initial_state])
    
    # Priority queue: (f_cost, g_cost, state, action_sequence)
    start_h = heuristic(initial_state, goal_state)
    open_set = [PlanNode(start_h, 0, frozenset(initial_state), [])]
    
    # Track visited states to avoid cycles
    visited: Set[frozenset] = set()
    
    iterations = 0
    while open_set and iterations < max_iterations:
        iterations += 1
        
        current = heapq.heappop(open_set)
        current_state = set(current.state)
        
        # Goal check
        if goal_state.issubset(current_state):
            # Reconstruct state progression
            states = [initial_state]
            state = initial_state.copy()
            for action_name in current.actions:
                action = next(a for a in actions if a.name == action_name)
                state = action.apply(state)
                states.append(state.copy())
            return (current.actions, current.g_cost, states)
        
        # Skip if already visited
        if current.state in visited:
            continue
        visited.add(current.state)
        
        # Expand neighbors
        for action in actions:
            if action.is_applicable(current_state):
                new_state = action.apply(current_state)
                new_state_frozen = frozenset(new_state)
                
                if new_state_frozen not in visited:
                    new_g = current.g_cost + action.cost
                    new_h = heuristic(new_state, goal_state)
                    new_f = new_g + new_h
                    
                    new_node = PlanNode(
                        f_cost=new_f,
                        g_cost=new_g,
                        state=new_state_frozen,
                        actions=current.actions + [action.name]
                    )
                    heapq.heappush(open_set, new_node)
    
    return None  # No plan found


def format_plan(
    actions: List[str],
    cost: float,
    states: List[Set[str]],
    action_library: List[ResearchAction] = None
) -> str:
    """Format research plan for display."""
    if action_library is None:
        action_library = RESEARCH_ACTIONS
    
    action_map = {a.name: a for a in action_library}
    
    lines = [
        "=" * 60,
        "GOAP RESEARCH PLAN",
        "=" * 60,
        f"Total Cost: {cost}",
        f"Steps: {len(actions)}",
        "",
        "EXECUTION SEQUENCE:",
        "-" * 40,
    ]
    
    for i, action_name in enumerate(actions, 1):
        action = action_map.get(action_name)
        if action:
            lines.append(f"\nStep {i}: {action.name}")
            lines.append(f"  Description: {action.description}")
            lines.append(f"  Cost: {action.cost}")
            lines.append(f"  Requires: {', '.join(action.preconditions)}")
            lines.append(f"  Produces: {', '.join(action.effects)}")
            lines.append(f"  State after: {', '.join(sorted(states[i]))}")
    
    lines.extend([
        "",
        "=" * 60,
        "FINAL STATE ACHIEVED:",
        "-" * 40,
        ", ".join(sorted(states[-1])) if states else "N/A",
        "=" * 60,
    ])
    
    return "\n".join(lines)


def create_research_goal(goal_type: str) -> Tuple[Set[str], Set[str]]:
    """
    Create initial and goal states for common research types.
    
    Args:
        goal_type: One of 'exploratory', 'verification', 'competitive', 'technology'
    
    Returns:
        Tuple of (initial_state, goal_state)
    """
    initial = {"topic_defined"}
    
    goals = {
        "exploratory": {
            "research_complete",
            "conclusions_formed",
            "patterns_identified",
            "claims_verified"
        },
        "verification": {
            "claims_verified",
            "primary_located",
            "consistency_checked"
        },
        "competitive": {
            "viewpoints_mapped",
            "conclusions_formed",
            "patterns_identified"
        },
        "technology": {
            "conclusions_formed",
            "claims_verified",
            "expert_opinions_available"
        },
        "quick": {
            "facts_cataloged",
            "content_retrieved"
        }
    }
    
    return initial, goals.get(goal_type, goals["exploratory"])


# Example usage and demonstration
if __name__ == "__main__":
    print("GOAP Research Planner Demo")
    print("=" * 60)
    
    # Example: Exploratory research
    initial, goal = create_research_goal("exploratory")
    
    print(f"\nInitial State: {initial}")
    print(f"Goal State: {goal}")
    
    result = find_research_plan(initial, goal)
    
    if result:
        actions, cost, states = result
        print(format_plan(actions, cost, states))
    else:
        print("No plan found!")
    
    # Example: Quick fact-finding
    print("\n" + "=" * 60)
    print("QUICK RESEARCH PLAN:")
    initial, goal = create_research_goal("quick")
    result = find_research_plan(initial, goal)
    
    if result:
        actions, cost, states = result
        print(format_plan(actions, cost, states))

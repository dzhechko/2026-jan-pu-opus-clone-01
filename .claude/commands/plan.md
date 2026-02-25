---
description: Plan feature implementation from SPARC documentation.
  Breaks down a feature into parallel tasks with time estimates.
  $ARGUMENTS: feature name or user story ID
---

# /plan $ARGUMENTS

## Steps
1. Find user story in `docs/Specification.md`
2. Find algorithms in `docs/Pseudocode.md`
3. Identify affected components from `docs/Architecture.md`
4. Check edge cases in `docs/Refinement.md`
5. Check BDD scenarios in `docs/test-scenarios.md`
6. Call `@planner` for task breakdown
7. Identify what can run in parallel (Task tool)
8. Show plan and ask for confirmation

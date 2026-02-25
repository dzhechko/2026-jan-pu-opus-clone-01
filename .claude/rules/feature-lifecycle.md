# Feature Development Lifecycle

## Protocol

Every new feature MUST follow the 4-phase lifecycle:

```
/feature [name]
  Phase 1: PLAN      → sparc-prd-manual → docs/features/<n>/sparc/
  Phase 2: VALIDATE   → requirements-validator (swarm, max 3 iterations)
  Phase 3: IMPLEMENT  → swarm of agents + parallel tasks
  Phase 4: REVIEW     → brutal-honesty-review (swarm)
```

## Rules

### Planning (Phase 1)
- ALL features get SPARC documentation, no exceptions
- Documentation lives in `docs/features/<feature-name>/sparc/`
- Use sparc-prd-manual in MANUAL mode for complex features, AUTO for minor
- Architecture.md MUST be consistent with project's root Architecture
- Commit docs before implementation

### Validation (Phase 2)
- Run requirements-validator as swarm (parallel validation agents)
- Minimum score: 70/100 average, no BLOCKED items
- Fix gaps in docs, not in code
- Max 3 iterations — if not passing, escalate to user
- Commit validation-report.md

### Implementation (Phase 3)
- Read SPARC docs — don't hallucinate code
- Modular design — components reusable across projects
- Use Task tool for parallel work on independent modules
- Commit after each logical change (not at end)
- Run tests in parallel with development
- Format: `feat(<feature-name>): <description>`

### Review (Phase 4)
- Use brutal-honesty-review with swarm of agents
- No sugar-coating — find real problems
- Fix all critical and major issues before marking complete
- Benchmark performance after implementation
- Commit review-report.md

## Feature Directory Structure

```
docs/features/
├── user-authentication/
│   ├── sparc/
│   │   ├── PRD.md
│   │   ├── Specification.md
│   │   ├── Architecture.md
│   │   ├── Pseudocode.md
│   │   ├── Solution_Strategy.md
│   │   ├── Refinement.md
│   │   ├── Completion.md
│   │   ├── Research_Findings.md
│   │   ├── Final_Summary.md
│   │   └── validation-report.md
│   └── review-report.md
├── payment-integration/
│   ├── sparc/
│   │   └── ...
│   └── review-report.md
└── ...
```

## When to Skip Phases

| Scenario | Skip | Justification |
|----------|------|---------------|
| Hotfix (1-5 lines) | Phase 1-2 | Too small for full SPARC |
| Config change | Phase 1-2 | No new functionality |
| Dependency update | Phase 1-2 | No new design needed |
| Refactoring | Phase 1 only | Validate + implement + review |
| New feature | NEVER skip | Full lifecycle always |

For skipped phases, still run Phase 4 (brutal-honesty-review) on the changes.

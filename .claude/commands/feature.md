---
description: Full feature lifecycle — from idea to reviewed implementation.
  Orchestrates SPARC planning, validation, implementation, and review.
  $ARGUMENTS: feature name or brief description
---

# /feature $ARGUMENTS

## Overview

Four-phase feature development lifecycle with quality gates between each phase.
All documentation goes to `docs/features/<feature-name>/sparc/`.

## Phase 1: PLAN (sparc-prd-manual)

**Goal:** Research, analyze, and create full SPARC documentation for the feature.

```
Read the sparc-prd-manual skill from .claude/skills/sparc-prd-manual/SKILL.md
```

1. Create feature directory: `docs/features/<feature-name>/sparc/`
2. Apply sparc-prd-manual MANUAL mode to the feature
3. Pass context:
   - Architecture: Distributed Monolith, Docker Compose, VPS
   - Tech: Next.js 15, tRPC, BullMQ, Prisma, PostgreSQL, Redis
   - AI: Dual provider (Cloud.ru + Global) via LLM Router
   - Security: Client-side encrypted key storage (AES-GCM)
4. Output all SPARC documents into the feature directory:
   - PRD.md, Solution_Strategy.md, Specification.md
   - Pseudocode.md, Architecture.md, Refinement.md
   - Completion.md, Research_Findings.md, Final_Summary.md
5. Git commit: `docs(<feature-name>): SPARC planning`

**Auto-proceed** to validation (show brief summary before continuing).

## Phase 2: VALIDATE (requirements-validator, swarm)

**Goal:** Validate SPARC documentation quality using swarm of validation agents.

```
Read the requirements-validator skill from .claude/skills/requirements-validator/SKILL.md
```

Use swarm of agents to validate (parallel via Task tool):

| Agent | Scope | Target |
|-------|-------|--------|
| validator-stories | User Stories from Specification.md | INVEST criteria, score ≥70 |
| validator-acceptance | Acceptance Criteria | SMART criteria, testability |
| validator-architecture | Architecture.md | Consistency with project Architecture |
| validator-pseudocode | Pseudocode.md | Completeness, implementability |
| validator-coherence | All SPARC files | Cross-reference consistency |

**Iterative loop (max 3 iterations):**
1. Run all validators in parallel (Task tool)
2. Aggregate gaps and blocked items
3. Fix gaps in SPARC documents
4. Re-validate
5. Repeat until: no BLOCKED items, average score ≥70

Save: `docs/features/<feature-name>/sparc/validation-report.md`
Git commit: `docs(<feature-name>): validation complete, score XX/100`

**Auto-proceed** to implementation (show brief validation results before continuing).

## Phase 3: IMPLEMENT (swarm + parallel tasks)

**Goal:** Implement the feature using validated SPARC documents as source of truth.

When SPARC plan is ready for implementation:
1. Read ALL documents from `docs/features/<feature-name>/sparc/`
2. Use swarm of agents and specialized skills to deliver:
   - `@planner` — break down into tasks from Pseudocode.md
   - `@architect` — ensure consistency with Architecture.md
   - Implementation agents — parallel Task tool for independent modules
3. **Make implementation modular** for reuse in other cases and applications
4. Save frequent commits to GitHub
5. Spawn concurrent tasks to speed up development

**Implementation rules:**
- Each module gets its own Task for parallel execution
- Reference SPARC docs, don't hallucinate code
- Commit after each logical unit: `feat(<feature-name>): <what>`
- Run tests in parallel with implementation

**Auto-proceed** to review (show brief implementation summary before continuing).

## Phase 4: REVIEW (brutal-honesty-review, swarm)

**Goal:** Rigorous post-implementation review and improvement.

```
Read the brutal-honesty-review skill from .claude/skills/brutal-honesty-review/SKILL.md
```

Use swarm of agents for review:

| Agent | Scope | Focus |
|-------|-------|-------|
| code-quality | Source code | Clean code, patterns, naming |
| architecture | Integration | Consistency with project architecture |
| security | Security surface | Vulnerabilities, input validation |
| performance | Hot paths | Bottlenecks, complexity |
| testing | Test coverage | Edge cases, missing tests |

Process:
1. Run brutal-honesty-review on implementation
2. Fix identified issues (use Task tool for parallel fixes)
3. Save frequent commits: `fix(<feature-name>): <what>`
4. Benchmark after implementation
5. Re-review critical findings until clean

Save review report: `docs/features/<feature-name>/review-report.md`
Git commit: `docs(<feature-name>): review complete`

## Completion

After all 4 phases:
```
✅ Feature: <feature-name>

📁 docs/features/<feature-name>/
├── sparc/                    # SPARC documentation
│   ├── PRD.md
│   ├── Specification.md
│   ├── Architecture.md
│   ├── Pseudocode.md
│   ├── ...
│   └── validation-report.md
└── review-report.md          # Brutal honesty review

📊 Validation: score XX/100
🔍 Review: X issues found → X fixed
💾 Commits: N commits

💡 Consider running /myinsights if you encountered any tricky issues.
```

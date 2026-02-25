---
name: sparc-prd-manual
description: Generate PRD and SPARC documentation with checkpoints between phases. Manual mode - confirm each step before proceeding.
---

# SPARC PRD Generator (Manual Mode)

Controlled skill for generating complete product documentation using SPARC methodology with checkpoints after each phase. Creates 11 production-ready files for AI-assisted development (Vibe Coding).

## When to Use

Trigger on:
- "создай PRD пошагово"
- "подготовь документацию с проверками"
- "SPARC документация manual"
- "PRD с checkpoint"
- "vibe coding документация пошагово"

## Output Documents (11 files)

1. **PRD.md** - Product Requirements Document
2. **Solution_Strategy.md** - Problem analysis (First Principles + TRIZ)
3. **Specification.md** - Requirements, user stories, acceptance criteria
4. **Pseudocode.md** - Algorithms, data flow, API contracts
5. **Architecture.md** - System design, tech stack, diagrams
6. **Refinement.md** - Edge cases, testing, optimization
7. **Completion.md** - Deployment, CI/CD, monitoring
8. **Research_Findings.md** - Market and technology research
9. **Final_Summary.md** - Executive summary
10. **CLAUDE.md** - AI tools integration guide

## Workflow (8 Phases with Checkpoints)

### Phase 0: EXPLORE → CHECKPOINT 0

**Goal:** Clarify the task through Socratic questioning.

**Output - Product Brief:**
```markdown
## Product Brief
**Product Name:** [Name]
**Problem Statement:** [Problem being solved]
**Target Users:** [Audience]
**Core Value Proposition:** [Key value]

### Key Features (MVP)
1. [Feature 1]
2. [Feature 2]
3. [Feature 3]

### Technical Context
- Platform: [Web/Mobile/Desktop/API]
- Stack Preferences: [If any]
- Integrations: [External systems]
- Constraints: [Limitations]

### Success Criteria
- [Criterion 1]
- [Criterion 2]
```

**CHECKPOINT 0 Commands:**
- `ок` / `ok` / `далее` → proceed to Research
- `уточни X` → clarify specific aspect
- `добавь Y` → add feature/requirement
- `измени Z` → modify parameter

---

### Phase 1: RESEARCH → CHECKPOINT 1

**Goal:** Gather verified market and technology intelligence.

**Research Areas:**
- Market Research (competitors, trends)
- Technology Research (libraries, frameworks)
- User Research (behavior patterns)
- Integration Research (APIs, compatibility)

**Output:** Research_Findings.md with citations

**CHECKPOINT 1 Commands:**
- `ок` → proceed to Solve
- `глубже X` → research topic deeper
- `добавь источники по Y` → add sources
- `сравни A и B` → comparative analysis

---

### Phase 2: SOLVE → CHECKPOINT 2

**Goal:** Deep problem analysis using 9-module framework.

**9 Modules:**
1. **First Principles** - Decompose to fundamental truths
2. **5 Whys** - Find root cause, not symptoms
3. **SCQA** - Situation, Complication, Question, Answer
4. **Game Theory** - Stakeholder interests, Nash equilibrium
5. **Second-Order Thinking** - Consequences of consequences
6. **TRIZ Contradictions** - Apply 40 inventive principles
7. **Design Thinking** - Empathy map, reframe problem (HMW)
8. **OODA Loop** - Observe, Orient, Decide, Act
9. **Solution Synthesis** - Integrate into coherent strategy

**Output:** Solution_Strategy.md

**CHECKPOINT 2 Commands:**
- `ок` → proceed to Specification
- `альтернатива для X` → consider different approach
- `углуби анализ Y` → deepen specific module
- `добавь stakeholder Z` → expand game theory analysis

---

### Phase 3: SPECIFICATION → CHECKPOINT 3

**Goal:** Transform strategy into detailed requirements.

**Output:** Specification.md + PRD.md
- Executive Summary
- User Stories with Acceptance Criteria
- Feature Matrix (MVP/v1/v2)
- Non-Functional Requirements
- Success Metrics

**CHECKPOINT 3 Commands:**
- `ок` → proceed to Pseudocode
- `добавь user story для X` → add user story
- `уточни acceptance criteria Y` → clarify criteria
- `измени приоритет Z` → change priority

---

### Phase 4: PSEUDOCODE → CHECKPOINT 4

**Goal:** Define algorithms and data flow.

**Output:** Pseudocode.md
- Data Structures
- Core Algorithms (inputs/outputs/steps)
- API Contracts
- State Transitions
- Error Handling Strategy

**CHECKPOINT 4 Commands:**
- `ок` → proceed to Architecture
- `оптимизируй алгоритм X` → optimize algorithm
- `добавь edge case Y` → add edge case
- `измени структуру Z` → modify structure

---

### Phase 5: ARCHITECTURE → CHECKPOINT 5

**Goal:** System design and technology choices.

**Output:** Architecture.md
- Architecture Overview (style, high-level diagram)
- Component Breakdown
- Technology Stack with Rationale
- Data Architecture
- Security Architecture
- Scalability Considerations

**CHECKPOINT 5 Commands:**
- `ок` → proceed to Refinement
- `альтернатива для X` → alternative technology
- `углуби безопасность` → deepen security section
- `добавь диаграмму Y` → add diagram

---

### Phase 6: REFINEMENT → CHECKPOINT 6

**Goal:** Edge cases, testing, optimization.

**Output:** Refinement.md
- Edge Cases Matrix
- Testing Strategy (unit, integration, e2e)
- Test Cases Specifications
- Performance Optimizations
- Security Hardening
- Accessibility (a11y)
- Technical Debt Items

**CHECKPOINT 6 Commands:**
- `ок` → proceed to Completion
- `добавь тест для X` → add test case
- `углуби edge case Y` → expand edge case
- `оптимизируй Z` → add optimization

---

### Phase 7: COMPLETION → CHECKPOINT 7

**Goal:** Deployment and operational readiness.

**Output:** Completion.md
- Deployment Plan (checklist, sequence, rollback)
- CI/CD Configuration
- Monitoring & Alerting Setup
- Logging Strategy
- Handoff Checklists (Dev, QA, Ops)

**CHECKPOINT 7 Commands:**
- `ок` / `финиш` → generate Final Package
- `добавь мониторинг X` → add monitoring
- `углуби rollback` → expand rollback plan
- `измени CI/CD` → modify pipeline

---

## TRIZ Quick Reference

Key principles for contradiction resolution:
- **Segmentation** - Divide into parts
- **Taking out** - Extract disturbing element
- **Local quality** - Non-uniform structure
- **Asymmetry** - Replace symmetry
- **Merging** - Combine identical objects
- **Universality** - Multi-function
- **Nesting** - Object inside another
- **The other way round** - Invert action
- **Dynamics** - Allow change
- **Partial action** - Do more or less than 100%
- **Another dimension** - Use 2D/3D
- **Feedback** - Introduce feedback loops
- **Self-service** - Object serves itself
- **Copying** - Use cheap copies
- **Composite materials** - Use composites

## Final Package

After CHECKPOINT 7 approval:

```
═══════════════════════════════════════════════════════════════
📦 SPARC DOCUMENTATION PACKAGE COMPLETE

/output/[product-name]-sparc/
├── PRD.md                    ✅ 
├── Solution_Strategy.md      ✅ 
├── Specification.md          ✅ 
├── Pseudocode.md            ✅ 
├── Architecture.md          ✅ 
├── Refinement.md            ✅ 
├── Completion.md            ✅ 
├── Research_Findings.md     ✅ 
├── Final_Summary.md         ✅ 
└── .claude/
    └── CLAUDE.md            ✅ 

🚀 READY FOR VIBE CODING
═══════════════════════════════════════════════════════════════
```

## Important Notes

- **MANUAL MODE**: ALWAYS stop at checkpoints
- **Wait for confirmation**: Do NOT proceed without user input
- **Gate check**: Skip Explore only if task is crystal clear (notify user)
- **Course correction**: User can redirect at any checkpoint
- Use Mermaid for diagrams
- Include concrete examples

## Checkpoint Template

After each phase output:

```
═══════════════════════════════════════════════════════════════
🔷 CHECKPOINT [N]: [PHASE NAME] COMPLETE

Резюме: [Brief summary of what was produced]

Следующий шаг: [Next phase name]

Команды:
• "ок" / "ok" / "далее" → продолжить
• "уточни X" → уточнить аспект
• "добавь Y" → добавить элемент
• "измени Z" → изменить параметр
• "назад" → вернуться к предыдущей фазе

Ваше решение?
═══════════════════════════════════════════════════════════════
```

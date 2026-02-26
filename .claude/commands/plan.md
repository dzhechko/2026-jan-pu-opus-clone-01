---
description: Plan feature implementation and save to docs/plans/.
  Lightweight alternative to /feature for small/medium changes.
  $ARGUMENTS: feature name or brief description
---

# /plan $ARGUMENTS

## Overview

Lightweight planning command that creates an implementation plan and **saves it to disk** in `docs/plans/`. Use this instead of `/feature` when changes don't warrant full SPARC lifecycle (hotfixes, config changes, small features, refactoring).

For new major features, use `/feature` instead (full 4-phase SPARC lifecycle).

## Steps

### 1. Research (gather context)

Explore the codebase to understand what needs to change:

1. Find related user story in `docs/Specification.md` (if exists)
2. Find algorithms in `docs/Pseudocode.md` (if exists)
3. Identify affected components from `docs/Architecture.md`
4. Check edge cases in `docs/Refinement.md` (if exists)
5. Check BDD scenarios in `docs/test-scenarios.md` (if relevant)
6. Read the actual source files that will be modified

### 2. Create plan

Write the plan as a markdown file. Generate a kebab-case slug from the feature name.

**Filename:** `docs/plans/<feature-slug>-<YYYY-MM-DD>.md`

**Template:**

```markdown
# Plan: <Feature Title>

**Date:** <YYYY-MM-DD>
**Status:** draft | approved | implemented | abandoned
**Complexity:** low | medium | high

## Context

<1-3 sentences: what problem this solves and why>

## Changes (<N> files)

### 1. `<file-path>` — <brief description>
- <bullet points describing specific changes>

### 2. `<file-path>` — <brief description>
- <bullet points describing specific changes>

...

## Files WITHOUT changes
- `<file-path>` — <why no changes needed>

## Dependencies
- <any prerequisites, packages, env vars, migrations>

## Verification
1. <how to verify the changes work>
2. <tests to run>
3. <manual checks>
```

### 3. Save & commit

1. Write the plan file to `docs/plans/<feature-slug>-<YYYY-MM-DD>.md`
2. Git commit: `docs(plans): <feature-name>`
3. Show the plan to the user and ask for confirmation to implement

### 4. After implementation

When the plan is implemented (in same or future session), update the plan status:
- Change `**Status:** draft` → `**Status:** implemented`
- Git commit: `docs(plans): mark <feature-name> implemented`

## When to use /plan vs /feature

| Scenario | Command | Reason |
|----------|---------|--------|
| New major feature (US-XX) | `/feature` | Full SPARC + validation + review |
| Small feature (1-5 files) | `/plan` | Lightweight, just plan + implement |
| Hotfix / bugfix | `/plan` | Quick reference doc |
| Refactoring | `/plan` | Document scope before changes |
| Config / infra change | `/plan` | Track what changed and why |
| Dependency update | `/plan` | Document breaking changes |

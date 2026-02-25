---
description: Capture a development insight or manage existing insights.
  Creates structured entry in myinsights/ folder with auto-indexing.
  $ARGUMENTS: brief title OR subcommand (archive INS-NNN, status INS-NNN [active|workaround|obsolete])
---

# /myinsights $ARGUMENTS

## What You Do

Manage the project's living knowledge base in `myinsights/` folder.
Each insight is stored as an individual file for precise context loading.

## Subcommands

- `/myinsights [title]` — capture a new insight (default)
- `/myinsights archive INS-NNN` — move insight to archive (obsolete)
- `/myinsights status INS-NNN [active|workaround|obsolete]` — change insight status

## Capture Flow (default)

### Step 0. Duplicate Detection

**BEFORE creating a new insight**, search the index for duplicates:

1. Read `myinsights/1nsights.md`
2. Search the `Error Signatures` column for matching error strings from the current issue
3. Search the `Summary` column for semantically similar descriptions

**If potential duplicate found:**
```
⚠️ Possible duplicate of [INS-NNN] Title
   File: myinsights/INS-NNN-slug.md
   
   Options:
   1. View existing insight and update it with new info
   2. Create new insight anyway (different root cause)
   3. Cancel
```

If the user chooses to update — append new info to the existing detail file under
a `### Update YYYY-MM-DD` subsection and update the index entry if needed.

### Step 1. Collect Information

Ask the user (or reconstruct from conversation context) these details:

- **Title:** One-line summary of the problem/finding
- **Error Signatures:** Exact error strings, codes, or exception names that can be grepped
  (e.g., `ECONNREFUSED`, `P1001`, `TypeError: Cannot read properties of undefined`)
- **Symptoms:** What went wrong? What was the unexpected behavior?
- **Diagnostic Steps:** What steps were taken to identify the root cause?
- **Root Cause:** What was the actual underlying problem?
- **Solution:** What fixed it? Step-by-step resolution.
- **Prevention:** How to avoid this in the future? Any guards, tests, or checks to add?
- **Tags:** Relevant categories (e.g., `docker`, `auth`, `ffmpeg`, `prisma`, `bullmq`, `llm-router`)
- **Related:** Links to other insights, docs, or issues (e.g., `INS-003`, `INS-017`)

### Step 2. Create Individual Detail File

**File naming:** `myinsights/INS-NNN-slug.md` where slug is a short kebab-case description.

```markdown
# [INS-NNN] Title

**Date:** YYYY-MM-DD
**Status:** 🟢 Active | 🟡 Workaround | 🔴 Obsolete
**Severity:** 🔴 Critical / 🟡 Medium / 🟢 Low
**Tags:** `tag1`, `tag2`, `tag3`
**Hits:** 0

## Error Signatures
EXACT_ERROR_STRING_1
EXACT_ERROR_STRING_2
error code or exception name

## Symptoms
[What went wrong — error messages, unexpected behavior, failing tests]

## Diagnostic Steps
1. [What was checked first]
2. [What was tried]
3. [What led to the root cause]

## Root Cause
[The actual underlying problem — be specific]

## Solution
1. [Step-by-step fix]
2. [Code changes, config changes]
3. [Verification that it works]

## Prevention
- [How to avoid this in the future]
- [Tests to add, checks to implement]

## Related
- [INS-XXX](INS-XXX-slug.md) — related insight description
- [Link to external doc or issue]
```

### Step 3. Update Index (`myinsights/1nsights.md`)

If `myinsights/1nsights.md` doesn't exist, create it:

```markdown
# 🔍 Development Insights Index

Living knowledge base. **Read this file first** — then load specific detail files as needed.

> **For Claude Code:** When you encounter an error, `grep` the Error Signatures column below.
> If you find a match, read ONLY the linked detail file — don't load everything.

| ID | Error Signatures | Summary | Status | Hits | File |
|----|-----------------|---------|--------|------|------|
```

Then append a new row:

```markdown
| INS-NNN | `ERROR_SIG_1`, `ERROR_SIG_2` | One-line summary | 🟢 Active | 0 | [INS-NNN-slug.md](INS-NNN-slug.md) |
```

### Step 4. Auto-numbering

List existing `INS-*.md` files in `myinsights/` (including `archive/`),
find the highest `INS-NNN` number, increment by 1. First entry is `INS-001`.

### Step 5. Notify

After saving:
```
✅ Insight captured: [INS-NNN] Title
📄 myinsights/INS-NNN-slug.md created
📋 myinsights/1nsights.md index updated
🔄 Will be auto-committed on session end (Stop hook)
```

If this is the FIRST insight in the project, also notify:
```
📌 myinsights/ reference added to CLAUDE.md as knowledge source
```

## Archive Flow (`/myinsights archive INS-NNN`)

1. Move `myinsights/INS-NNN-slug.md` → `myinsights/archive/INS-NNN-slug.md`
2. Update status in `1nsights.md` index to `🔴 Obsolete`
3. Add `(archived)` suffix to the file link in index
4. Notify: `📦 INS-NNN archived → myinsights/archive/`

## Status Flow (`/myinsights status INS-NNN [status]`)

1. Update `**Status:**` line in the detail file
2. Update status column in `1nsights.md` index
3. If new status is `obsolete` — suggest archiving: `💡 Consider: /myinsights archive INS-NNN`
4. Notify: `🔄 INS-NNN status → [new status]`

## Hit Counter

When an insight is used to solve a problem (matched via grep or manual lookup):
1. Increment `**Hits:**` counter in the detail file
2. Increment `Hits` column in `1nsights.md` index
3. Note: `📊 INS-NNN hit count → N (helped solve current issue)`

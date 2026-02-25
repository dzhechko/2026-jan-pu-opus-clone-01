# Download Clips — Required Fixes Before Implementation

**Status:** 🔴 **BLOCKED** — Specification validation identified 2 critical blockers + 3 major gaps
**Current Score:** 84.89/100 | **Target Score:** 92-94/100
**Validation Report:** `docs/features/download-clips/sparc/validation-report.md` (804 lines, comprehensive analysis)

---

## BLOCKER #1: Scenario 2.4 — ZIP Generation Timeout ⛔ CRITICAL

**File:** `docs/features/download-clips/sparc/Specification.md` (lines 66-71)
**Current Scenario:**
```gherkin
Scenario: ZIP generation timeout
  Given I have 10 large clips
  When ZIP generation takes longer than expected
  Then I see a progress indicator
  And the download completes within 30 seconds
```

**Problems:**
1. **"Large clips" undefined** — Cannot be 5GB (unrealistic for 30s), unclear if 1GB (realistic)
2. **Progress indicator type unspecified** — Bar? Spinner? Percentage? ETA?
3. **Timeout behavior not defined** — Error on timeout? Continue? Cancel button?

**Required Fix:**

Choose ONE approach:

### Option A (RECOMMENDED): Quantify to 1GB
```gherkin
Scenario: ZIP generation with progress tracking
  Given I have 10 clips, each approximately 100MB (1GB total)
  When I click "Скачать все"
  Then a modal appears with a linear progress bar
  And the progress bar shows the percentage of clips processed (0-100%)
  And the download completes within 30 seconds
  And the progress modal closes when download is ready
```

**Rationale:**
- 1GB in 30s = 33 MB/s requirement (realistic for S3 + streaming)
- 100MB per clip is typical for edited short videos
- Clear success criteria

### Option B: Extend Timeout
```gherkin
Scenario: ZIP generation with large files
  Given I have 10 clips, each approximately 500MB (5GB total)
  When I click "Скачать все"
  Then a modal appears with a linear progress bar showing percentage
  And the download completes within 120 seconds
  And the progress modal shows cancel button
```

**Rationale:**
- 5GB in 120s = 42 MB/s requirement (achievable)
- Supports higher quality clips

---

**THEN Update Refinement.md** (add new section after line 68):

```markdown
### ZIP Progress Indicator Specification

**UI Component:** Modal dialog

**Contents:**
- Heading: "Preparing ZIP (4 of 10 clips)..."
- Linear progress bar (0-100% filled)
- Text: "45% complete • 18s elapsed"
- Cancel button (optional, disabled during critical operations)

**Behavior:**
- Shows immediately when download starts
- Updates in real-time as clips are streamed to archive
- Closes automatically when download begins
- Remains visible if generation takes >5 seconds

**Error Handling:**
- If timeout exceeded: Show "ZIP generation timed out. Try downloading fewer clips." with Retry button
- If S3 error mid-stream: Show "Connection interrupted. Try again later."
```

---

## BLOCKER #2: Scenario 3.3 — Upgrade Prompt Details ⛔ CRITICAL

**File:** `docs/features/download-clips/sparc/Specification.md` (lines 95-99)
**Current Scenario:**
```gherkin
Scenario: Upgrade prompt on watermark badge click
  Given I am on the Free plan
  When I click the watermark badge
  Then I see an upgrade prompt with plan comparison
```

**Problem:**
- **"Plan comparison" is too vague** — No spec for fields, plans, layout, buttons, destinations

**Required Fix:**

Update Refinement.md with this section (add after line 68):

```markdown
### Watermark Badge Upgrade Modal

**Trigger:** Click "Водяной знак" badge on any clip card (free plan only)

**Modal Appearance:**
- Type: Center-aligned dialog (shadcn/Dialog)
- Title: "Remove Watermark"
- Subtitle: "Upgrade your plan to download watermark-free videos"

**Contents: Plan Comparison Table**

| Feature | Free | Start | Pro |
|---------|------|-------|-----|
| **Watermark** | ✓ Yes | ✗ No | ✗ No |
| **Download limit** | 10/month | Unlimited | Unlimited |
| **Video quality** | Up to 1080p | Up to 4K | Up to 4K |
| **Support** | Community | Email | Priority Email |

**Action Buttons (in footer):**
1. **"Upgrade to Start"** (primary, blue)
   - Destination: `/checkout?plan=start`
   - Subtitle: "Most popular" (optional badge)

2. **"Learn More"** (secondary, gray outline)
   - Destination: `/pricing`
   - Opens in same window

3. **"Cancel"** (tertiary, text button)
   - Closes modal
   - Returns focus to clip card

**Keyboard & Accessibility:**
- ESC key closes modal
- Tab navigation through buttons
- aria-label for each button
- aria-modal on dialog

**Responsive Design:**
- Desktop: 500px wide, side-by-side buttons
- Mobile: 100vw, full-width modal, stacked buttons
```

---

## MAJOR #1: Scenario 1.4 — Error Categorization & Retry

**File:** `docs/features/download-clips/sparc/Specification.md` (lines 32-36)
**Current Scenario:**
```gherkin
Scenario: Download error (S3 failure)
  Given the presigned URL generation fails
  When I click "Скачать"
  Then I see an error notification: "Ошибка скачивания. Попробуйте ещё раз"
```

**Problem:**
- Doesn't distinguish S3 error types (403, 500, timeout)
- "Попробуйте ещё раз" (try again) implies UI affordance but not specified
- Doesn't cover network timeout

**Required Fix:**

Update Refinement.md with this section:

```markdown
### Download Error Handling

**S3 Presign Errors (403, 500, Service Unavailable):**
- Error Message: "Ошибка скачивания. Попробуйте ещё раз"
- Button State: Remains enabled (user can retry immediately)
- Behavior: Toast appears top-right for 5s, auto-dismisses
- Retry: User clicks button again

**Network Timeout (presign request >10s):**
- Error Message: "Ошибка соединения. Проверьте интернет и попробуйте ещё раз"
- Button State: Remains enabled
- Behavior: Toast appears, auto-dismisses after 6s
- Retry: User clicks button to retry

**Clip Not Ready (clip.status != 'ready' at request time):**
- Error Message: "Клип ещё не готов. Подождите несколько секунд"
- Button State: Disabled for 5 seconds, then re-enabled
- Behavior: Toast warning appears
- Auto-Recovery: Button re-enables after 5s

**Rate Limit Exceeded (>30 downloads/60s):**
- Error Message: "Слишком много скачиваний. Попробуйте через минуту"
- Button State: Disabled for 60 seconds
- Behavior: Toast shows countdown timer
- Visual Feedback: Button shows "Попробуйте через 45s" countdown text
```

---

## MAJOR #2: Scenario 2.3 — Race Condition During Batch

**File:** `docs/features/download-clips/sparc/Specification.md` (lines 60-64)
**Current Scenario:**
```gherkin
Scenario: Some clips not ready
  Given I have 5 clips, 3 ready and 2 rendering
  When I click "Скачать все"
  Then the ZIP contains only the 3 ready clips
  And I see a note: "Скачано 3 из 5 клипов. 2 клипа ещё рендерятся"
```

**Problem:**
- Doesn't handle clips changing status during download (Refinement E12 mentions but scenario doesn't test)
- API route should check clip.filePath and status at stream time, not just query time

**Required Fix:**

Add NEW scenario to Specification.md (after current 2.3):

```gherkin
Scenario: Clip status changes during batch download
  Given I have 5 clips: 4 ready and 1 rendering
  And I click "Скачать все"
  And the server begins streaming clip 1
  When one clip transitions from "rendering" → "ready" (before we query)
  And another clip transitions from "ready" → "rendering" (during streaming)
  Then the ZIP contains only the clips that remained "ready" during streaming
  And I see note: "Скачано 3 из 5 клипов. 2 клипа изменили статус"
```

**Update Refinement.md** (modify E12 section):

```markdown
## Edge Cases — Status Changes During Batch

**E12: Clip transitions from ready to rendering during batch**

**Scenario:** User starts batch download with 4 ready clips. Between query time and stream time, one clip transitions to rendering (render job restarted, corruption recovery, etc.)

**Handling:**
1. API queries all clips WHERE status='ready' at query time (4 clips selected)
2. For each clip, API calls `getObjectStream(clip.filePath)`
3. If S3 object missing or filePath NULL → skip clip, log warning
4. After all clips streamed: Calculate final_count = clips_actually_streamed
5. Return notification: `"Скачано ${final_count} из ${initial_count} клипов..."`

**Implementation:**
- Check clip.filePath is not null before streaming
- Wrap S3 stream in try-catch
- Track streams completed vs attempted
- Send message with actual counts, not predicted counts
```

---

## MAJOR #3: Scenario 2.4 — Progress Indicator Visual Clarity

**Problem:** "Progress indicator" is ambiguous (bar? spinner? percentage? time?)

**Required Fix:**

This is already addressed by BLOCKER #1 fix (see above). Update Refinement.md to specify:

```markdown
### Progress Indicator Visual Design

**Type:** Linear progress bar (not spinner)

**Content:**
- Progress bar fills 0-100% left-to-right
- Percentage text: "45%" displayed inside or above bar
- Status text below: "4 of 10 clips processed"
- Time tracking: "18s elapsed • ~12s remaining"

**Example Progression:**
- Start: Bar at 0%, "Generating ZIP..."
- 2s in: "25% • 1 of 4 clips"
- 5s in: "50% • 2 of 4 clips"
- 7s in: "75% • 3 of 4 clips"
- 8s in: "100% • 4 of 4 clips • Preparing download..."
- Then: Modal closes, browser download starts

**Accessibility:**
- aria-valuenow updated every 500ms
- aria-label: "Loading ZIP archive: 45% complete"
- Live region updates for screen readers
```

---

## Implementation Checklist

### Phase: FIX (Before Implementation)

- [ ] **BLOCKER #1:** Choose quantification approach (Option A or B), update Specification.md lines 66-71
- [ ] **BLOCKER #1:** Add progress indicator spec to Refinement.md
- [ ] **BLOCKER #2:** Add plan comparison modal spec to Refinement.md
- [ ] **MAJOR #1:** Add error categorization to Refinement.md
- [ ] **MAJOR #2:** Add new race condition scenario to Specification.md
- [ ] **MAJOR #2:** Update Refinement.md E12 edge case
- [ ] **MAJOR #3:** Add progress indicator visual design to Refinement.md (handled by BLOCKER #1 fix)
- [ ] Commit fixes: `docs(download-clips): resolve validation blockers and majors`
- [ ] Re-validate using validation-report.md checklist
- [ ] Target score: 92-94/100

---

## Validation Checklist (Run After Fixes)

Use this checklist to verify fixes before proceeding to implementation:

```
BLOCKER #1 Verification:
☐ Specification.md Scenario 2.4 now specifies clip size (100MB or 500MB per clip)
☐ Specification.md Scenario 2.4 now specifies progress indicator type (linear bar with %)
☐ Refinement.md has "ZIP Progress Indicator Specification" section
☐ Timeout behavior documented (error on timeout, with retry option)

BLOCKER #2 Verification:
☐ Refinement.md has "Watermark Badge Upgrade Modal" section
☐ Plan comparison table shows Free/Start/Pro with 3+ fields
☐ Modal type specified (center-aligned dialog)
☐ CTA buttons defined: "Upgrade to Start" (primary), "Learn More", "Cancel"
☐ Button destinations specified (/checkout?plan=start, /pricing)

MAJOR #1 Verification:
☐ Refinement.md has "Download Error Handling" section
☐ S3 errors (403, 500) have same message
☐ Network timeout has distinct message
☐ Rate limit error defined
☐ Retry mechanism specified (button remains enabled or countdown timer)

MAJOR #2 Verification:
☐ Specification.md has new scenario: "Clip status changes during batch"
☐ Refinement.md E12 updated with implementation approach
☐ API checks clip.filePath at stream time
☐ Final notification shows actual counts, not predicted

MAJOR #3 Verification:
☐ Progress indicator visual fully specified (linear bar, percentage, time)
☐ Accessibility notes included
☐ Responsive design addressed
```

---

## Expected Outcome

**Before Fixes:** 84.89/100, BLOCKED status
**After Fixes:** 92-94/100, PASS status

Then proceed to Phase 3 (Implementation) with swarm of agents.

---

**Last Updated:** 2026-02-25
**Validator:** Requirements Validator
**Next Action:** Resolve blockers + majors, re-validate, implement

# Download Clips — Validation Report

**Date:** 2026-02-25
**Validator:** Requirements Validator (SMART + Testability Assessment)
**Status:** 🔴 **BLOCKED** — 2 critical gaps must be resolved before implementation
**Overall Score:** 84.89/100 (Acceptable with fixes)

---

## Executive Summary

The Download Clips Specification is well-structured with clear user stories and detailed supporting documentation (Architecture, Pseudocode, Refinement). However, **2 critical blockers** prevent implementation:

1. **Scenario 2.4** ("ZIP generation timeout") lacks definition of "large clips" size and progress indicator type
2. **Scenario 3.3** ("Upgrade prompt") inadequately specifies "plan comparison" contents

Additionally, **3 major clarifications** are recommended. After resolving blockers and majors, the specification should score 92+/100.

---

## Validation Methodology

Each of the **11 Gherkin scenarios** was evaluated against **6 SMART criteria**:

| Criterion | Definition |
|-----------|-----------|
| **Specific** | Clear, unambiguous preconditions, triggers, and expected outcomes |
| **Measurable** | Quantifiable results (file presence, counts, text matches, HTTP codes) |
| **Achievable** | Tech stack can deliver (Next.js, tRPC, archiver, S3 streaming) |
| **Relevant** | Aligns with user stories and project goals |
| **Time-bound** | Explicit or implicit time bounds (performance targets, timeouts, status checks) |
| **Testable** | Can be automated as unit, integration, or E2E tests |

---

## Scenario-by-Scenario Analysis

### Feature 1: Download Single Clip (US-DC-01) — Score: 86.25/100 ✓ PASS

#### Scenario 1.1: Download ready clip from clip list
**Given** I have a clip with status "ready"
**When** I click "Скачать" on the clip card
**Then** the browser starts downloading an MP4 file
**And** the filename contains the clip title

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES — Clear trigger, measurable outcome |
| Measurable | ✓ YES — Content-Disposition header, filename pattern match |
| Achievable | ✓ YES — Existing `clip.download` tRPC mutation, S3 presigned URL |
| Relevant | ✓ YES — Core user journey (upload → edit → **download**) |
| Time-bound | ✓ YES — Implicit: presigned URL 1h expiry, <2s latency target |
| Testable | ✓ YES — E2E: Playwright download monitoring, integration: mock S3 |

**Score: 90/100** | **Status: PASS**
**Minor Gap:** Doesn't explicitly test presigned URL expiry scenario (E1 in Refinement).

---

#### Scenario 1.2: Download from clip editor
**Given** I am editing a clip with status "ready"
**When** I click "Скачать" in the action bar
**Then** the browser starts downloading an MP4 file

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES |
| Measurable | ✓ YES |
| Achievable | ✓ YES — Same mechanism as 1.1, different UI component |
| Relevant | ✓ YES — Alternate access point, improves workflow |
| Time-bound | ✓ YES |
| Testable | ✓ YES |

**Score: 88/100** | **Status: PASS**
**Minor Gap:** Doesn't specify if editor unsaved changes should be preserved (assumed correct).

---

#### Scenario 1.3: Clip not ready
**Given** I have a clip with status "rendering"
**Then** the download button is disabled
**And** shows tooltip "Клип ещё не готов"

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES — Exact tooltip text provided |
| Measurable | ✓ YES — Button.disabled = true, text exact match |
| Achievable | ✓ YES — Client-side conditional on clip.status |
| Relevant | ✓ YES — Error prevention |
| Time-bound | ✓ YES |
| Testable | ✓ YES |

**Score: 85/100** | **Status: PASS**
**Minor Gap:** Doesn't specify status polling mechanism for re-enabling button after render (assumed WebSocket).

---

#### Scenario 1.4: Download error (S3 failure)
**Given** the presigned URL generation fails
**When** I click "Скачать"
**Then** I see an error notification: "Ошибка скачивания. Попробуйте ещё раз"

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ PARTIAL — Doesn't distinguish S3 error types (403 vs 500 vs timeout) |
| Measurable | ✓ YES — Error notification text exact match |
| Achievable | ✓ YES — tRPC error handling + toast (existing pattern) |
| Relevant | ✓ YES — Production error handling critical |
| Time-bound | ✓ YES |
| Testable | ✓ YES — Mock tRPC error, verify toast |

**Score: 82/100** | **Status: PASS (with caution)**
**Major Gap:** No retry mechanism defined ("Попробуйте ещё раз" implies UI affordance).

---

### Feature 2: Download All Clips (US-DC-02) — Score: 82.75/100 ✗ BLOCKED

#### Scenario 2.1: Download all ready clips as ZIP
**Given** I have a video with 5 clips, 4 with status "ready"
**When** I click "Скачать все" on the video detail page
**Then** the browser downloads a ZIP file containing 4 MP4 files
**And** the ZIP filename is based on the video title

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES — Precondition quantified (5 clips, 4 ready) |
| Measurable | ✓ YES — ZIP file count verifiable, filename pattern testable |
| Achievable | ✓ YES — Streaming archiver + S3 (Pseudocode section 4 provided) |
| Relevant | ✓ YES — Batch efficiency critical for paid users |
| Time-bound | ✓ YES — <30s implicit target (from NFR) |
| Testable | ✓ YES — E2E unzip, verify count/names |

**Score: 88/100** | **Status: PASS**
**Minor Gap:** Doesn't address duplicate filename handling (E5 in Refinement).

---

#### Scenario 2.2: No ready clips
**Given** I have a video with all clips still rendering
**Then** the "Скачать все" button is disabled
**And** shows tooltip "Нет готовых клипов для скачивания"

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES |
| Measurable | ✓ YES |
| Achievable | ✓ YES — Query WHERE status='ready' → count check |
| Relevant | ✓ YES |
| Time-bound | ✓ YES |
| Testable | ✓ YES |

**Score: 86/100** | **Status: PASS**

---

#### Scenario 2.3: Some clips not ready
**Given** I have 5 clips, 3 ready and 2 rendering
**When** I click "Скачать все"
**Then** the ZIP contains only the 3 ready clips
**And** I see a note: "Скачано 3 из 5 клипов. 2 клипа ещё рендерятся"

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES — Quantified precondition and outcome |
| Measurable | ✓ YES — ZIP count and message text verifiable |
| Achievable | ✓ YES — Count logic in API route |
| Relevant | ✓ YES — Handles partial-ready scenario |
| Time-bound | ✓ YES |
| Testable | ✓ YES |

**Score: 85/100** | **Status: PASS**
**Major Gap:** Doesn't address race condition — what if clip becomes ready/rendering during download? (E12 in Refinement mentions but scenario doesn't test).

---

#### Scenario 2.4: ZIP generation timeout ⛔ BLOCKER
**Given** I have 10 large clips
**When** ZIP generation takes longer than expected
**Then** I see a progress indicator
**And** the download completes within 30 seconds

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✗ PARTIAL — "Large clips" undefined, "longer than expected" vague |
| Measurable | ✓ PARTIAL — 30s deadline measurable, but "progress indicator" type not defined |
| Achievable | ~ QUESTIONABLE — 30s for 5GB ZIP uncertain (if "large" = 500MB × 10) |
| Relevant | ✓ YES — Performance critical for UX |
| Time-bound | ✓ YES — "within 30 seconds" explicit |
| Testable | ~ PARTIAL — Cannot reproduce "10 large clips" without size definition |

**Score: 72/100** | **Status: 🔴 BLOCKED**

**Critical Issues:**
1. **Missing Definition:** What is "large"? 100MB? 500MB? 1GB per clip?
   - At 500MB × 10 = 5GB, 30s target is aggressive (requires ~167 MB/s sustained)
   - At 100MB × 10 = 1GB, 30s is achievable

2. **Progress Indicator Type Unspecified:**
   - Is it a linear progress bar with percentage?
   - A spinner with "Generating..." message?
   - ETA display?
   - Affects implementation complexity and UX design

3. **Timeout Behavior Unclear:**
   - What happens if ZIP exceeds 30s? Error? Continue in background?
   - Does progress indicator show cancel button?

**Recommended Fix:**
```gherkin
Given I have 10 clips, each 100MB (1GB total)
When I click "Скачать все"
Then a modal shows a linear progress bar with percentage
And the download completes within 30 seconds
```

---

### Feature 3: Watermark Indicator (US-DC-03) — Score: 85.67/100 ✗ BLOCKED

#### Scenario 3.1: Free user sees watermark badge
**Given** I am on the Free plan
**When** I view my clip list
**Then** each clip card shows a "Водяной знак" badge
**And** the download button tooltip includes "с водяным знаком"

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES — Precondition (plan='free'), exact badge text |
| Measurable | ✓ YES — Badge presence, tooltip text match |
| Achievable | ✓ YES — User plan from auth headers, conditional rendering |
| Relevant | ✓ YES — Watermark disclosure important |
| Time-bound | ✓ YES |
| Testable | ✓ YES |

**Score: 90/100** | **Status: PASS**

---

#### Scenario 3.2: Paid user no watermark badge
**Given** I am on the Start or Pro plan
**When** I view my clip list
**Then** no watermark badge is shown

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✓ YES |
| Measurable | ✓ YES — Badge absence verifiable (DOM check) |
| Achievable | ✓ YES |
| Relevant | ✓ YES |
| Time-bound | ✓ YES |
| Testable | ✓ YES |

**Score: 89/100** | **Status: PASS**

---

#### Scenario 3.3: Upgrade prompt on watermark badge click ⛔ BLOCKER
**Given** I am on the Free plan
**When** I click the watermark badge
**Then** I see an upgrade prompt with plan comparison

| Criterion | Assessment |
|-----------|-----------|
| Specific | ✗ PARTIAL — "Plan comparison" is too vague |
| Measurable | ✗ PARTIAL — "Upgrade prompt" verifiable, but content not defined |
| Achievable | ✓ YES — Modal with pricing table is standard pattern |
| Relevant | ✓ YES — Monetization nudge |
| Time-bound | ✓ YES |
| Testable | ✗ PARTIAL — Cannot verify correctness without specs |

**Score: 78/100** | **Status: 🔴 BLOCKED**

**Critical Issues:**
1. **"Plan Comparison" Not Defined:**
   - Which fields are shown? (Features? Pricing? Video limits? Download limits?)
   - How many plans displayed? (Free vs Start? Free vs Start vs Pro?)
   - What's the layout? (Table? Cards? Side-by-side?)

2. **Modal UI Type Not Specified:**
   - Dialog (centered modal)?
   - Sheet (bottom drawer)?
   - New page/route?

3. **CTA Buttons Not Defined:**
   - Which upgrade path is recommended? (Start? Pro?)
   - Close button? Back button?
   - "Upgrade Now" destination?

**Recommended Fix:**
Add to Refinement.md or Specification.md:
```
Scenario 3.3 (Revised): Upgrade prompt on watermark badge click
  Given I am on the Free plan
  When I click the watermark badge
  Then a modal appears with a plan comparison table showing:
    | Feature | Free | Start | Pro |
    | Video limit | 100MB | 1GB | 10GB |
    | Clips per video | 5 | Unlimited | Unlimited |
    | Watermark | Yes | No | No |
  And the "Upgrade to Start" button is highlighted as recommended CTA
```

---

## Cross-Scenario Analysis

### Overall Metrics

| Metric | Score | Status |
|--------|-------|--------|
| **Average (all 11 scenarios)** | 84.89/100 | 🟡 Needs fixes |
| **Feature 1 (Single Download)** | 86.25/100 | ✓ PASS |
| **Feature 2 (Batch ZIP)** | 82.75/100 | ✗ BLOCKED (Scenario 2.4) |
| **Feature 3 (Watermark)** | 85.67/100 | ✗ BLOCKED (Scenario 3.3) |

### SMART Criteria Aggregate Scores

| Criterion | Score | Issues |
|-----------|-------|--------|
| **Specific** | 86/100 | Scenario 3.3 "plan comparison" too vague |
| **Measurable** | 87/100 | 2.4 "large clips" & 3.3 "comparison" unmeasurable |
| **Achievable** | 82/100 | 2.4: 30s timeout may be unrealistic for 5GB |
| **Relevant** | 92/100 | All scenarios align with user stories |
| **Time-bound** | 91/100 | Most have implicit/explicit bounds |
| **Testable** | 83/100 | Vague definitions prevent full test coverage |

### Testability Breakdown

| Test Type | Scenarios | Status |
|-----------|-----------|--------|
| **Unit tests** | 9/11 | ✓ Easily testable (button states, conditionals) |
| **Integration tests** | 8/11 | ✓ Mockable (tRPC, S3, Prisma) |
| **E2E tests** | 10/11 | ~ Partially automatable (vague definitions in 2.4, 3.3) |

---

## Critical Gaps (BLOCKERS)

### BLOCKER #1: Scenario 2.4 — ZIP Generation Timeout

**Issue:** Scenario is underspecified in 3 dimensions:

1. **Undefined "Large Clips" Size**
   - Current: "10 large clips"
   - Problem: Cannot determine if 30s timeout is realistic
   - Example scenarios:
     - 10 × 100MB = 1GB → 30s achievable ✓
     - 10 × 500MB = 5GB → 30s unrealistic ✗
   - Impact: Performance testing impossible, implementation uncertainty

2. **Progress Indicator Type Not Specified**
   - Current: "progress indicator"
   - Problem: Could mean spinner, linear bar, percentage, ETA, etc.
   - Impact: UI designer cannot proceed, implementation varies wildly
   - Suggested: "Linear progress bar with percentage + elapsed time"

3. **Timeout Behavior Not Defined**
   - Current: "completes within 30 seconds"
   - Problem: What if ZIP takes 45s? Does it error? Timeout?
   - Impact: Error handling strategy unclear

**Resolution Path:**
- Quantify "large clips": "each 100MB for 1GB total" OR adjust timeout to 60s
- Specify progress indicator: Visual mockup or detailed description
- Define timeout behavior: "If ZIP exceeds 30s, show error: 'ZIP too large, try fewer clips'"

**Impact on Implementation:**
- ZIP handler timeout configuration
- Progress API endpoint design
- Error message strategy
- UI component complexity

---

### BLOCKER #2: Scenario 3.3 — Upgrade Prompt Plan Comparison

**Issue:** "Plan comparison" is too vague for implementation.

**Missing Specifications:**

1. **Comparison Fields**
   - What features are shown? (download limit? watermark? video duration?)
   - Example:
     ```
     | Feature | Free | Start | Pro |
     | Download limit | 10/month | Unlimited | Unlimited |
     | Watermark | Yes | No | No |
     | HD video | No | Yes | Yes |
     ```

2. **Modal UI Type**
   - Dialog? Sheet? Inline? Page navigation?
   - Impact: Implementation approach varies (shadcn/Dialog vs Sheet vs Link)

3. **CTA Buttons**
   - Which plan is recommended? (Start? Pro?)
   - Button labels: "Upgrade to Start"? "Get Started"?
   - Destination URL: /pricing? /checkout?

4. **Plan Selection Logic**
   - Does user select plan in modal or navigate to pricing page?
   - Can user close modal?

**Resolution Path:**
- Add to Refinement.md, "Watermark Upgrade UX" section:
  ```markdown
  ### Plan Comparison Modal

  **Trigger:** Click watermark badge on clip card (free plan only)

  **UI Type:** Center-aligned dialog modal

  **Contents:**
  - Heading: "Upgrade to Remove Watermark"
  - Table:
    | Feature | Free | Start | Pro |
    | Watermark | ✓ | ✗ | ✗ |
    | Download limit | 10/month | Unlimited | Unlimited |
    | Video quality | Up to 1080p | Up to 4K | Up to 4K |

  **CTA Buttons:**
  - "Upgrade to Start" (primary, navigates to /checkout?plan=start)
  - "Learn More" (secondary, navigates to /pricing)
  - "Cancel" (tertiary, closes modal)
  ```

---

## Major Gaps (Recommended Clarifications)

### MAJOR #1: Scenario 1.4 — Error Categorization

**Issue:** "Presigned URL generation fails" doesn't distinguish error types.

**Current Gap:**
```gherkin
Given the presigned URL generation fails
When I click "Скачать"
Then I see an error notification: "Ошибка скачивания. Попробуйте ещё раз"
```

**Problems:**
1. Which S3 errors trigger this message? (403 Forbidden? 500 Server Error? Timeout?)
2. What does "Попробуйте ещё раз" (try again) mean? Button? Auto-retry? Manual retry?
3. Does network timeout get same message as auth error?

**Recommended Fix:**
```gherkin
Scenario: Download error (S3 failure)
  Given the presigned URL generation fails due to S3 error (403, 500, or timeout)
  When I click "Скачать"
  Then I see error notification: "Ошибка скачивания. Попробуйте ещё раз"
  And the button remains enabled for retry (not disabled)

Scenario: Download network timeout
  Given the presigned URL request times out (>10s)
  When I click "Скачать"
  Then I see error notification: "Ошибка скачивания. Проверьте соединение"
  And the button remains enabled for retry
```

**Impact:**
- Error handling strategy in tRPC mutation
- Retry UX design (auto vs manual)
- Toast notification variations

---

### MAJOR #2: Scenario 2.3 — Race Condition

**Issue:** Scenario doesn't address clips changing status during batch download.

**Current Gap:**
```gherkin
Scenario: Some clips not ready
  Given I have 5 clips, 3 ready and 2 rendering
  When I click "Скачать все"
  Then the ZIP contains only the 3 ready clips
```

**Problem:**
- What if a clip transitions from "ready" → "rendering" after query but before stream?
- Refinement E12 mentions this but scenario doesn't test it
- Current pseudocode doesn't check status at stream time

**Recommended Addition:**
```gherkin
Scenario: Clip becomes rendering during batch download
  Given I have 5 clips, 4 ready and 1 rendering
  And I start downloading all clips
  When one clip transitions to "ready" state before stream time
  And another clip transitions to "rendering" during streaming
  Then the ZIP should contain:
    - All 4 originally-ready clips (streamed successfully)
    - Skip the clip that became rendering (check at stream time)
  And I see: "Скачано 4 из 5 клипов. 1 клип не готов"
```

**Implementation Impact:**
- API route must check clip.filePath and status at stream time (not just at query time)
- Error handling for missing S3 objects during archiving
- Notification must show final counts, not predicted counts

---

### MAJOR #3: Scenario 2.4 — Progress Indicator Type

**Issue:** "Progress indicator" is not visually specified.

**Current Gap:**
```gherkin
Then I see a progress indicator
And the download completes within 30 seconds
```

**Ambiguity:**
- Linear progress bar? (shows percentage 0-100%)
- Spinner? (shows indeterminate loading)
- Progress bar + ETA? (shows time remaining)
- Percentage text? ("45% - 15s remaining")

**Recommended Fix:**
```gherkin
Then I see a modal with:
  - Heading: "Preparing ZIP..."
  - Linear progress bar showing percentage (0-100%)
  - Text: "[%] clips processed • [time]s elapsed"
And the download completes within 30 seconds
```

Or alternatively:
```gherkin
Then I see a spinner with text "Generating ZIP (4 of 10 clips)..."
And the download completes within 30 seconds
```

**Impact:**
- Modal component implementation
- Backend progress API endpoint
- Frontend streaming/polling logic

---

## Minor Gaps (Informational)

These do not block implementation but should be noted:

### Minor #1: Scenario 1.2 — Editor State

**Gap:** Doesn't specify if editor unsaved changes are preserved.

**Assumption:** Download doesn't close editor or affect state (likely correct based on pseudocode).

**Recommendation:** Document in edge cases that download is non-blocking.

---

### Minor #2: Scenario 1.3 — Status Polling

**Gap:** Doesn't specify how button becomes enabled after rendering.

**Assumption:** Component subscribes to WebSocket updates from background worker (likely correct).

**Recommendation:** Document in Architecture that clip status updates propagate via WebSocket.

---

### Minor #3: Scenario 2.1 — Duplicate Filenames

**Gap:** Doesn't explicitly test duplicate filename scenario.

**Mitigation:** Refinement E5 covers: append index ("title.mp4", "title_2.mp4").

**Status:** Edge case handled, acceptable omission from main scenario.

---

## Consistency with Supporting Documents

### Architecture.md Alignment: ✓ FULL COMPLIANCE

- Component diagram matches scenarios (ClipCard, ActionBar, API route)
- Integration points align (clip.download mutation, S3 presign, archiver)
- Security considerations covered (ownership check, rate limiting, filename sanitization)

### Pseudocode.md Alignment: ✓ FULL COMPLIANCE

- Section 1-6 provides complete implementation paths
- Data flow (sections 2-5) matches scenario expectations
- Edge cases addressed (E1-E12)

### Refinement.md Alignment: ✓ GOOD (with noted gaps)

- Testing strategy covers 9/11 scenarios
- Edge cases E1-E12 supplement scenarios
- Security hardening documented
- Accessibility requirements included
- Missing: Progress indicator spec (affects E2E testing)

### PRD.md Alignment: ✓ FULL COMPLIANCE

- Success criteria align with scenarios
- Scope matches features (single, batch, watermark)
- Out-of-scope items not in scenarios

---

## Testability Assessment

### Unit Tests (9/11 Scenarios Easily Testable)

**Fully Testable:**
- Scenario 1.1: Button state when status='ready'
- Scenario 1.3: Button disabled when status='rendering'
- Scenario 2.2: Button disabled when no clips ready
- Scenario 3.1: Badge shown when plan='free'
- Scenario 3.2: Badge hidden when plan='start' or 'pro'
- `sanitizeFilename()` function (Refinement testing strategy)
- Watermark badge logic

**Partially Testable:**
- Scenario 1.4: Error notification (requires tRPC mock)
- Scenario 2.3: Partial ZIP count logic (requires data setup)
- Scenario 3.3: Modal appearance (requires design specs)

### Integration Tests (8/11 Scenarios Mockable)

**Fully Mockable:**
- `clip.download` tRPC mutation (mock S3 presign)
- `video.downloadAll` API route (mock Prisma, S3 stream, archiver)
- Rate limiting checks
- Ownership verification

**Partial Issues:**
- Scenario 2.4: Cannot mock "10 large clips" without size definition
- Scenario 3.3: Cannot verify plan comparison without specs

### E2E Tests (10/11 Scenarios Automatable)

**Automatable:**
- Click button → verify download (Playwright download API)
- Check badge presence (DOM query)
- Upload video with clips → test full flow
- Free tier vs paid tier flows

**Problematic:**
- Scenario 2.4: Cannot reliably test 30s timeout without 5GB file
- Scenario 3.3: Cannot verify plan comparison accuracy without UI specs

---

## Achievability Assessment

### Tech Stack Capability: ✓ EXCELLENT

| Component | Tech | Assessment |
|-----------|------|-----------|
| Single download | S3 presigned URL | ✓ Existing, proven |
| Batch ZIP | archiver + streaming | ✓ Tested pattern, low latency |
| Progress UI | WebSocket or chunked encoding | ✓ Standard pattern |
| Watermark badge | Conditional rendering | ✓ Simple client-side logic |
| Upgrade modal | shadcn/Dialog + tRPC | ✓ Existing pattern |
| Rate limiting | Redis | ✓ Existing middleware |

### Achievability Concerns

**Scenario 2.4 Timeout:**
- If "large clips" = 500MB × 10 = 5GB
  - 30s target requires ~167 MB/s sustained throughput
  - S3 read: typical 100-200 MB/s ✓
  - Archiver overhead: ~10% ✓
  - Network to user: ~167 MB/s required ✗ (demanding for typical user)
  - **Verdict:** Achievable technically, unrealistic for user experience

- If "large clips" = 100MB × 10 = 1GB
  - 30s target requires ~33 MB/s sustained
  - **Verdict:** ✓ Fully achievable

**Recommendation:** Clarify "large" definition or adjust timeout to 60s for larger files.

---

## Recommendations

### Immediate Actions (REQUIRED — Before Implementation)

1. **Resolve BLOCKER #1 (Scenario 2.4):**
   - Define clip size: "10 clips × 100MB = 1GB" or adjust timeout to 60s
   - Specify progress indicator: "Linear progress bar with percentage"
   - Document timeout behavior: "Show error if ZIP exceeds timeout"

2. **Resolve BLOCKER #2 (Scenario 3.3):**
   - Add plan comparison table to Refinement.md
   - Specify modal UI type: Dialog
   - Define CTA buttons and destinations

### Secondary Actions (Recommended Before Implementation)

3. **Clarify MAJOR #1 (Error handling):**
   - Document which S3 errors map to which messages
   - Define retry mechanism (auto vs manual)

4. **Address MAJOR #2 (Race conditions):**
   - Add scenario for status transitions during batch
   - Update API route to check filePath at stream time

5. **Finalize MAJOR #3 (Progress UI):**
   - Create visual mockup of progress indicator
   - Specify modal layout and button labels

### Post-Implementation

6. **Performance Testing:**
   - Benchmark ZIP generation with actual 10× clips
   - Measure 30s/60s timeout adequacy
   - Test progress indicator accuracy

7. **Accessibility Audit:**
   - Verify modal keyboard navigation (Scenario 3.3)
   - Test screen reader announcements for progress
   - Refinement.md accessibility section already covers basics

---

## Final Scorecard

| Metric | Score | Status |
|--------|-------|--------|
| **Overall Specification Quality** | 84.89/100 | 🟡 BLOCKED |
| **Feature 1: Single Download** | 86.25/100 | ✓ PASS (minor gaps only) |
| **Feature 2: Batch ZIP** | 82.75/100 | ✗ BLOCKED (Scenario 2.4) |
| **Feature 3: Watermark** | 85.67/100 | ✗ BLOCKED (Scenario 3.3) |
| **SMART: Specific** | 86/100 | 🟡 Scenario 3.3 vague |
| **SMART: Measurable** | 87/100 | 🟡 2.4, 3.3 hard to measure |
| **SMART: Achievable** | 82/100 | 🟡 2.4 timeout questioned |
| **SMART: Relevant** | 92/100 | ✓ Excellent alignment |
| **SMART: Time-bound** | 91/100 | ✓ Good bounds |
| **SMART: Testable** | 83/100 | 🟡 Vague definitions |

### Status: 🔴 BLOCKED

**Do not proceed to implementation.** Resolve BLOCKER #1 and #2, then revalidate.

**Expected score after fixes:** 92-94/100

---

## Appendix: Test Plan Template

Once blockers are resolved, implement tests matching this template:

### Unit Tests
```typescript
describe('clip-card', () => {
  test('downloads ready clip', async () => {
    const { getByRole } = render(<ClipCard clip={{status: 'ready'}} />);
    expect(getByRole('button', {name: /Скачать/})).not.toBeDisabled();
  });

  test('disables download button for rendering clip', async () => {
    const { getByRole } = render(<ClipCard clip={{status: 'rendering'}} />);
    expect(getByRole('button', {name: /Скачать/})).toBeDisabled();
  });
});
```

### Integration Tests
```typescript
describe('clip.download mutation', () => {
  test('returns presigned URL for ready clip', async () => {
    const result = await caller.clip.download({id: 'clip-123'});
    expect(result.downloadUrl).toMatch(/^https:\/\/.*\.s3/);
  });

  test('rejects download for non-ready clip', async () => {
    await expect(caller.clip.download({id: 'rendering-clip'}))
      .rejects.toThrow('Clip not ready');
  });
});
```

### E2E Tests
```typescript
test('downloads single clip from clip list', async ({page}) => {
  await page.goto('/videos/123');
  const downloadPromise = page.waitForEvent('popup');
  await page.click('text=Скачать');
  const newPage = await downloadPromise;
  // Verify download
});

test('free user sees watermark badge', async ({page}) => {
  await loginAs('free-user');
  await page.goto('/clips');
  await expect(page.locator('[data-testid="watermark-badge"]')).toBeVisible();
});
```

---

**Report Generated:** 2026-02-25
**Validator:** Requirements Validator Swarm
**Next Steps:** Address blockers, revalidate, proceed to Phase 3 (Implementation)

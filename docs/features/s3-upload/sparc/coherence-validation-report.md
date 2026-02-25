# Coherence Validation Report: S3 Upload Feature
**Date:** 2026-02-25
**Validator:** coherence-validator agent
**Documents reviewed:** PRD.md, Solution_Strategy.md, Specification.md, Pseudocode.md, Architecture.md, Refinement.md, Completion.md, Research_Findings.md, Final_Summary.md

---

## Overall Score: 76 / 100

---

## Category 1: Feature Scope Consistency

**Score: 18/20**

### Findings

**PASS — Core feature set is consistent across all documents.**
All nine documents agree on the same four high-level capabilities: presigned single upload, multipart upload, presigned download URLs, and the `packages/s3` shared package. The upload completion + STT trigger flow is mentioned consistently in PRD (feature 5), Specification (US-S3-02), Pseudocode (`confirmUpload` algorithm), Architecture (sequence diagram), and Final_Summary.

**MINOR ISSUE — Thumbnail path builders are in scope in architecture documents but thumbnail generation is explicitly out of scope in PRD.**

- `PRD.md:51` — "Thumbnail generation (part of video processing pipeline feature)" is listed as out of scope.
- `Architecture.md:53` — `paths.ts` includes `# S3 key builders (videoSource, clip, thumbnail)`.
- `Architecture.md:99-102` — The S3 bucket structure diagram includes a `thumbnails/` directory.
- `Specification.md:53` — US-S3-04 requires `thumbnailPath` as an exported path builder.
- `Pseudocode.md:20` — `S3Paths` type includes `thumbnail: (userId, videoId, clipId) => string`.

**Assessment:** The PRD correctly excludes thumbnail *generation* (FFmpeg work). Including the *path builder function* for thumbnails in `packages/s3` is architecturally sound (it is infra, not generation logic) and not a true contradiction. However, the PRD's "Out of Scope" section does not clarify this distinction, which could cause implementer confusion. Minor flag only.

**PASS — Stale upload cleanup cron is mentioned in Refinement (edge cases #2, #3) and in Final_Summary and Completion, but it is absent from Architecture's component breakdown and from the Completion dev checklist.**

- `Refinement.md:8-9` — Cron required for orphaned multipart parts and stuck `uploading` videos.
- `Final_Summary.md:45` — "Stale upload cleanup (>24h)" listed as mitigation with status "Designed".
- `Completion.md:88` — Ops checklist: "Stale upload cleanup cron configured" (ops item only).
- `Architecture.md` — No mention of a cron job, BullMQ scheduler, or cleanup worker component.
- `Completion.md` Dev Checklist (lines 72–80) — No dev checklist item for the cleanup cron implementation.

**This is a minor scope gap:** the cron is acknowledged as needed but has no implementation home defined in Architecture, and is not in the developer checklist. It could be missed during implementation.

---

## Category 2: Terminology Consistency

**Score: 16/20**

### Findings

**ISSUE — `getObject` vs `getObjectBytes` naming discrepancy.**

- `Specification.md:52` — US-S3-04 requires the package to export `getObjectBytes`.
- `Architecture.md:52` — `operations.ts` is listed as providing `headObject, getObjectBytes, deleteObject` (consistent with Specification).
- `Architecture.md:166` — In the Publish Worker integration code snippet: `const clipData = await getObject(clip.filePath)` — uses `getObject` (not `getObjectBytes`).

**Impact:** An implementer reading the Architecture integration example would write `getObject`, but the actual exported function name per Specification and Architecture's own module list is `getObjectBytes`. One code snippet contradicts the established API surface. **Medium severity.**

**ISSUE — Path builder function name inconsistency.**

- `Specification.md:53` — Exports `videoSourcePath`, `clipPath`, `thumbnailPath` (suffix `Path`).
- `Pseudocode.md:18-20` — `S3Paths` type uses property names `videoSource`, `clip`, `thumbnail` (no `Path` suffix).
- `Architecture.md:53` — Describes `paths.ts` as "S3 key builders (videoSource, clip, thumbnail)" — no `Path` suffix.
- `Architecture.md:158` — Integration snippet uses `clipPath(userId, videoId, clipId)` — WITH `Path` suffix.

**Impact:** Three different naming patterns exist in the same document set. The Architecture even contradicts itself between the module description (line 53: `videoSource`) and the integration example (line 158: `clipPath`). An implementer cannot determine the canonical name without a decision. **Medium severity.**

**PASS — `packages/s3` name is fully consistent** across all nine documents.

**PASS — `confirmUpload`, `createFromUpload`, `completeMultipart` tRPC procedure names are consistent** across Pseudocode, Architecture, Specification, Completion, and Final_Summary.

**PASS — Status values** (`uploading`, `transcribing`, `ready`) are used consistently.

---

## Category 3: Numbers and Thresholds

**Score: 14/20**

### Findings

**ISSUE — Minimum multipart part size: 5MB (S3 API limit) vs 10MB (Pseudocode hardcoded floor).**

- `Research_Findings.md:43` — "Multipart upload: parts 5MB–5GB, up to 10,000 parts" (actual S3 API constraint).
- `Pseudocode.md:100` — `partSize = max(partSize, 10 * 1024 * 1024)   // min 10MB`

**Assessment:** The Pseudocode deliberately imposes 10MB as a floor above the 5MB S3 minimum, which is a valid design choice for efficiency. However, this deviation is never explained in any document. If a developer reads Research_Findings first they will see 5MB as the minimum and may not understand why Pseudocode doubles it. A comment or note is missing. **Minor severity** (not a bug, but undocumented deviation).

**ISSUE — Concurrent part upload count: 3 (Pseudocode/Refinement) vs "3-5 concurrent" (Research_Findings).**

- `Pseudocode.md:223` — "// Upload parts with concurrency limit (3 parallel)"
- `Refinement.md:87` — "3 concurrent part uploads"
- `Research_Findings.md:57` — "Browser uploads parts in parallel (3-5 concurrent)"

**Assessment:** Research_Findings presents a range (exploratory), and Pseudocode/Refinement settle on 3 as the design decision. Not a contradiction, but the Research document is not updated to reflect the settled decision, which could cause implementer confusion. **Minor severity.**

**PASS — Presigned URL expiry: 1 hour** is consistent across PRD (line 25), Specification (lines 40, 77-78), Pseudocode (lines 75, 76, 91, 199 — all use `expiresIn: 3600`), Architecture (lines 123-124).

**PASS — Rate limit: 10 uploads/hour per user** is consistent across PRD (line 45), Specification (line 18), Architecture (line 143), Refinement (lines 16, 72, 100), Completion (line 77).

**PASS — 100MB threshold** for single vs multipart upload is consistent across Solution_Strategy (lines 48-49), Specification (lines 12-13), Pseudocode (lines 72, 78), Architecture (lines 20, 23), Research_Findings (lines 49, 62-64).

**PASS — 4GB max file size** is consistent across PRD (lines 13, 35, 40), Specification (line 16), Research_Findings (line 109).

**NOTE — Potential concern: single PutObject max is ~5GB per Research_Findings (line 42), and the max file size is 4GB. Since files ≤100MB use single PUT and files >100MB use multipart, the 4GB limit for multipart is well within S3's 5GB-per-part and 10,000-part limits. No contradiction, but the single PUT path is only used for ≤100MB files, so the 5GB single-object limit is irrelevant in practice.**

**ISSUE — Solution_Strategy.md:71 mentions "24h expiry for presigned URLs" in the risk table.**

- `Solution_Strategy.md:71` — "Multipart with resume; 24h expiry for presigned URLs"
- `Solution_Strategy.md:73` — "Short expiry (1h upload, 1h download)"
- `Specification.md:77` — "Presigned URL expiry (upload): 1 hour"
- `Pseudocode.md:75` — `expiresIn: 3600` (1 hour)

**Impact:** Line 71 of Solution_Strategy says presigned URL expiry is 24h for the large-file failure mitigation, while line 73 of the same document says 1h, and all other documents say 1h. This is a direct **contradiction within Solution_Strategy.md itself**, and also contradicts the rest of the document set. The 1h value is the correct design decision (confirmed by 5 documents). **Medium severity.**

---

## Category 4: Architecture References vs Pseudocode

**Score: 17/20**

### Findings

**PASS — Architecture sequence diagram matches Pseudocode algorithms.** The full flow in Architecture.md (mermaid, lines 8-38) aligns step-by-step with the Pseudocode algorithms for `createFromUpload`, browser upload, `completeMultipart`, and `confirmUpload`.

**PASS — `packages/s3` file structure in Architecture.md (lines 44-56) maps to Pseudocode data structures.** `config.ts`, `paths.ts`, `presign.ts`, `multipart.ts`, `operations.ts`, `validation.ts` all have corresponding algorithm sections in Pseudocode.

**PASS — STT job payload is identical** between Pseudocode (`videoId, userId, filePath: video.filePath, strategy: video.llmProviderUsed` — line 152-155) and Architecture (`{ videoId, userId, filePath: video.filePath, strategy: video.llmProviderUsed }` — line 151).

**ISSUE — Browser Algorithm: `completeMultipart` call is missing `videoId`.**

- `Pseudocode.md:252` — The tRPC `video.completeMultipart` contract specifies `INPUT: { videoId: string, uploadId: string, parts: [...] }`.
- `Pseudocode.md:235` — The Browser Upload Algorithm calls `trpc.video.completeMultipart({ uploadId, parts: completedParts })` — `videoId` is absent.
- `Architecture.md:28` — The sequence diagram shows `completeMultipart(videoId, parts)` — `uploadId` is absent in the diagram but `videoId` is present.

**Impact:** The browser-side pseudocode for multipart upload omits `videoId` from the `completeMultipart` call, but the API contract requires it. The Architecture diagram omits `uploadId`. These are two inconsistencies in the same call: the three representations (Pseudocode algorithm, Pseudocode API contract, Architecture diagram) do not agree on the complete parameter set. **Medium severity.**

**ISSUE — `confirmUpload` Pseudocode extracts `fileSize` but does not save it to the database.**

- `Specification.md:29` — "Server extracts file size from HeadObject `Content-Length`" — implies persistence.
- `Pseudocode.md:145-148` — `fileSize = headResult.ContentLength` is captured, then `db.video.update({ data: { status: 'transcribing' } })` — `fileSize` is NOT included in the `data` object.

**Impact:** The Specification acceptance criterion says the server extracts file size, implying it is stored (as it would be needed later by the pipeline and for display). The Pseudocode computes it but discards it. This is a functional gap between Specification and Pseudocode. **Medium severity.**

---

## Category 5: Edge Cases vs Error Handling

**Score: 10/15**

### Findings

**PASS — Edge case #4 (non-video file with video extension):** Covered by `confirmUpload` algorithm in Pseudocode (lines 136-142): magic bytes validation, delete from S3, delete DB record, throw `BAD_REQUEST`.

**PASS — Edge case #8 (file exactly 100MB):** Pseudocode (line 72) uses `<=` for simple upload and `>` for multipart, consistent with Refinement's stated handling.

**PASS — Edge case #12 (empty file, 0 bytes):** Refinement notes checking `fileSize > 0` in `createFromUpload`. The Pseudocode `createFromUpload` algorithm does not explicitly show this check, but since `ContentLength` is passed to `PutObjectCommand` (line 74), a 0-byte check is implied by the Content-Length constraint on the presigned URL. The check is not explicitly shown, making implementation guidance incomplete. Minor gap.

**PASS — Edge case #13 (filename with special characters):** Refinement correctly notes "use only videoId in S3 key, not filename." The Pseudocode correctly implements this at line 70: `key = \`videos/${userId}/${videoId}/source.${ext}\`` — only the extension (not the full filename) is used.

**FAIL — Edge case #5 (presigned URL expires before upload completes):** Refinement (line 11) says "Client detects 403, shows 'ссылка истекла, попробуйте снова'." The Browser Upload Algorithm in Pseudocode has no error handling for S3 PUT failures (including 403). The algorithm ends at step 6 for the success case with no `ON error` path for the XHR call. **Medium severity.**

**FAIL — Edge case #6 (S3 bucket CORS not configured):** Refinement (line 13) says "Detect CORS error, show setup instructions." No CORS error detection is present in the Browser Upload Algorithm in Pseudocode. **Minor severity** (admin-facing edge case).

**FAIL — Edge case #7 (S3 credentials invalid/expired):** Refinement (line 14) says "Graceful error: 'Ошибка хранилища'." Neither the `createFromUpload` nor `confirmUpload` algorithms in Pseudocode have error handling for S3 SDK authentication failures. No `TRY/CATCH` wrapping S3 operations appears in any Pseudocode algorithm. **Medium severity.**

**FAIL — Client-side magic bytes pre-check not in Pseudocode.** Architecture (line 75) and Refinement (line 91) both describe a client-side magic bytes pre-check before upload starts. Research_Findings (line 77) describes using `FileReader`. The `validateMagicBytes` algorithm exists in Pseudocode (server-side), but there is no browser-side algorithm or pseudocode for the client-side pre-validation step. It appears only in the server-side `confirmUpload` flow. **Minor severity** (the algorithm function itself is reusable, but the client invocation path is undocumented).

---

## Category 6: Deployment vs Architecture Components

**Score: 9/10**

### Findings

**PASS — All core components from Architecture are referenced in Completion.**

- `packages/s3` → Completion dev checklist line 72 + deployment step line 14.
- tRPC video router (3 procedures) → Completion dev checklist lines 73.
- tRPC clip router (download) → Completion dev checklist line 74.
- VideoUploader → Completion dev checklist line 75, deployment step 5.
- Docker Compose env vars → Completion ops checklist line 86.
- CORS bucket config → Completion ops checklist line 83.

**PASS — Worker service list in Completion is consistent with Architecture.**

- `Completion.md:40` — Lists `web, worker-stt, worker-llm, worker-video, worker-publish` as recipients of S3 env vars.
- `Architecture.md:175` — Says "S3 credentials added to `web` and `worker-*` services". Consistent.

**MINOR GAP — Stale upload cleanup cron is in Completion ops checklist (line 88) but is absent from the dev checklist, and no component in Architecture.md takes ownership of implementing it.** A developer reading the dev checklist would not know they need to build a cron or BullMQ repeatable job for stale cleanup.

**PASS — `.env.example` is referenced in Final_Summary (line 31) as a modified file, but Completion's deployment steps only reference `.env` (line 12), not `.env.example`.** Minor inconsistency but not impactful.

---

## Category 7: Contradictions

**Score: 8/15**

### Findings

**CONTRADICTION #1 — CORS `AllowedMethods`: Architecture omits `POST`.**

- `Architecture.md:134` — `"AllowedMethods": ["PUT", "GET", "HEAD"]`
- `Research_Findings.md:87` — `"AllowedMethods": ["PUT", "POST", "GET", "HEAD"]`

**Impact:** AWS SDK multipart upload uses `POST` for `CreateMultipartUpload` operations when called from the browser indirectly via presigned URLs. In the presigned multipart pattern used here, only `PUT` is needed for `UploadPart` requests from the browser. However, omitting `POST` from CORS could cause issues if any browser-initiated multipart initiation path is used. The Research_Findings version (with `POST`) is safer and should be canonical. Since Architecture is the implementation guide, an implementer following Architecture.md would configure a CORS rule that may be too restrictive. **Medium severity.**

**CONTRADICTION #2 — CORS `ExposeHeaders`: Architecture omits `x-amz-request-id`.**

- `Architecture.md:136` — `"ExposeHeaders": ["ETag"]`
- `Research_Findings.md:89` — `"ExposeHeaders": ["ETag", "x-amz-request-id"]`

**Assessment:** `x-amz-request-id` is useful for debugging but not required for functional operation (ETag is what multipart needs). This is a minor inconsistency with low impact on functionality. **Minor severity.**

**CONTRADICTION #3 — Solution_Strategy.md line 71 says "24h expiry for presigned URLs" while line 73 of the same document says "1h upload, 1h download".** (Also reported under Category 3.) This is an internal self-contradiction in Solution_Strategy.md. **Medium severity.**

**CONTRADICTION #4 — AVI magic bytes validation is incomplete in Pseudocode vs Research_Findings.**

- `Research_Findings.md:74` — AVI requires checking BOTH `RIFF` at offset 0 AND `AVI ` at offset 8.
- `Pseudocode.md:171` — AVI only checks `[0x52, 0x49, 0x46, 0x46]` at offset 0 (the `RIFF` header only).

**Impact:** A WAV file, WAVE file, or any other RIFF-container format (e.g., animated cursor .ani) would pass the AVI magic bytes check in Pseudocode, potentially being accepted as a valid video. The Research_Findings correctly notes the dual-check requirement. **Medium severity.**

**CONTRADICTION #5 — MOV magic bytes: Research_Findings specifies 6 bytes (`ftypqt`), Pseudocode checks only 4 bytes (`ftyp`).**

- `Research_Findings.md:73` — MOV: `66 74 79 70 71 74` (ftypqt), offset 4 — 6 bytes.
- `Pseudocode.md:170` — `mov: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }` — only 4 bytes (`ftyp`).

**Impact:** Since MP4 also uses `ftyp` at offset 4 (line 168), the MOV check in Pseudocode is identical to the MP4 check. It would never distinguish MOV from MP4, and the 4-byte check for MOV is a subset of the full `ftypqt` signature. More critically, MP4 and MOV are both valid targets for the pipeline, so this only affects format reporting accuracy, not security. But it means the `validateMagicBytes` function's `format` return value cannot correctly distinguish MP4 from MOV. **Minor severity** for security, but signals an incomplete algorithm.

---

## Summary of Issues

| # | Category | Severity | File(s) | Description |
|---|----------|----------|---------|-------------|
| I-1 | Terminology | Medium | `Architecture.md:166` vs `Specification.md:52` | `getObject` used in integration example instead of `getObjectBytes` |
| I-2 | Terminology | Medium | `Specification.md:53` vs `Pseudocode.md:18` vs `Architecture.md:53,158` | Path builder function names inconsistent (`videoSourcePath`/`clipPath` vs `videoSource`/`clip`) |
| I-3 | Numbers | Medium | `Solution_Strategy.md:71` vs `Solution_Strategy.md:73` + all others | Self-contradiction: 24h vs 1h presigned URL expiry in same document |
| I-4 | Architecture/Pseudocode | Medium | `Pseudocode.md:235` vs `Pseudocode.md:252` vs `Architecture.md:28` | `completeMultipart` browser call missing `videoId`; Architecture diagram missing `uploadId` |
| I-5 | Architecture/Pseudocode | Medium | `Pseudocode.md:145-148` vs `Specification.md:29` | `fileSize` extracted from HeadObject but not saved to database |
| I-6 | Contradictions | Medium | `Architecture.md:134` vs `Research_Findings.md:87` | CORS `AllowedMethods` differs (`POST` absent from Architecture) |
| I-7 | Contradictions | Medium | `Pseudocode.md:171` vs `Research_Findings.md:74` | AVI magic bytes incomplete (missing second check at offset 8) |
| I-8 | Edge Cases | Medium | `Pseudocode.md` (missing) vs `Refinement.md:11` | No error handling for presigned URL 403 expiry in Browser Algorithm |
| I-9 | Edge Cases | Medium | `Pseudocode.md` (missing) vs `Refinement.md:14` | No error handling for S3 credential failures in any algorithm |
| I-10 | Contradictions | Minor | `Pseudocode.md:170` vs `Research_Findings.md:73` | MOV magic bytes: 4-byte check makes MOV indistinguishable from MP4 |
| I-11 | Edge Cases | Minor | `Pseudocode.md` (missing) vs `Architecture.md:75` + `Refinement.md:91` | Client-side magic bytes pre-check algorithm not in Pseudocode |
| I-12 | Deployment | Minor | `Architecture.md` (missing) vs `Refinement.md:8-9` | Stale upload cleanup cron has no implementation home in Architecture component breakdown |
| I-13 | Numbers | Minor | `Research_Findings.md:57` vs `Pseudocode.md:223` | Concurrency: "3-5 concurrent" (Research) vs "3 parallel" (Pseudocode/Refinement) — unresolved range |
| I-14 | Numbers | Minor | `Research_Findings.md:43` vs `Pseudocode.md:100` | Min part size 5MB (S3 limit) vs 10MB (Pseudocode floor) — undocumented deviation |
| I-15 | Contradictions | Minor | `Architecture.md:136` vs `Research_Findings.md:89` | CORS `ExposeHeaders` differs (`x-amz-request-id` absent from Architecture) |
| I-16 | Scope | Minor | `PRD.md:51` vs `Architecture.md:53,99` vs `Specification.md:53` | Thumbnail path builder in scope but thumbnail generation out of scope — distinction not clarified |
| I-17 | Deployment | Minor | `Completion.md:72-80` (missing) vs `Refinement.md:8-9` | Stale cleanup cron not in developer checklist |
| I-18 | Architecture/Pseudocode | Minor | `Pseudocode.md:145-148` | `fileSize > 0` check mentioned in Refinement (#12) is absent from `createFromUpload` Pseudocode |

---

## Score Breakdown

| Category | Max | Score | Notes |
|----------|-----|-------|-------|
| Feature Scope | 20 | 18 | Minor thumbnail scope ambiguity; cleanup cron missing from dev checklist |
| Terminology | 20 | 16 | `getObject`/`getObjectBytes` mismatch; path builder naming inconsistency |
| Numbers/Thresholds | 20 | 14 | 24h vs 1h contradiction in Solution_Strategy; undocumented deviations |
| Architecture vs Pseudocode | 20 | 17 | `completeMultipart` missing param; `fileSize` not persisted |
| Edge Cases vs Error Handling | 15 | 10 | Missing error paths in Browser Algorithm; incomplete ABI for client-side magic bytes |
| Deployment vs Architecture | 10 | 9 | All major components covered; cron ownership gap |
| Contradictions | 15 | 8 | CORS methods, AVI/MOV magic bytes, 24h/1h expiry |
| **Total** | **120** | **92** | Normalized to 100: **76/100** |

---

## Recommended Fixes (Priority Order)

1. **[HIGH] Fix `Solution_Strategy.md:71`** — Change "24h expiry for presigned URLs" to "1h expiry" or clarify that the *multipart uploadId* lives 24h on S3 (not the presigned URL itself).

2. **[HIGH] Fix `Pseudocode.md:235`** — Add `videoId` to the `completeMultipart` browser call: `trpc.video.completeMultipart({ videoId, uploadId, parts: completedParts })`.

3. **[HIGH] Fix `Pseudocode.md:145-148`** — Add `fileSize` to the `db.video.update` data object: `data: { status: 'transcribing', fileSize }`.

4. **[HIGH] Fix `Pseudocode.md:171`** — Add second AVI check at offset 8 for bytes `[0x41, 0x56, 0x49, 0x20]` ('AVI ') to match Research_Findings specification.

5. **[MEDIUM] Resolve path builder names** — Pick one canonical name: either `videoSourcePath`/`clipPath`/`thumbnailPath` (Specification) or `videoSource`/`clip`/`thumbnail` (Pseudocode/Architecture module list). Update all documents to match. Update `Architecture.md:158` integration example accordingly.

6. **[MEDIUM] Resolve `getObject` vs `getObjectBytes`** — Update `Architecture.md:166` integration example to use `getObjectBytes` to match the exported API surface defined in Specification and Architecture module list.

7. **[MEDIUM] Update `Architecture.md:134`** — Add `"POST"` to `AllowedMethods` to match Research_Findings and ensure forward compatibility with any direct multipart initiation patterns.

8. **[MEDIUM] Add error handling to Browser Upload Algorithm in `Pseudocode.md`** — Include `ON error (status 403): show "ссылка истекла, попробуйте снова"` for expired presigned URLs, and a generic S3 error path.

9. **[MEDIUM] Add S3 error handling** to `createFromUpload` and `confirmUpload` algorithms in `Pseudocode.md` — Wrap S3 SDK calls in try/catch with graceful fallback ("Ошибка хранилища").

10. **[LOW] Add stale cleanup cron component** to `Architecture.md` component breakdown — Assign ownership (e.g., BullMQ repeatable job in `apps/worker`) and add a dev checklist item in `Completion.md`.

11. **[LOW] Add `fileSize > 0` check** explicitly to `createFromUpload` Pseudocode algorithm (Refinement edge case #12).

12. **[LOW] Add client-side magic bytes pre-check pseudocode** — Either as a sub-section of the Browser Upload Algorithm or as a standalone algorithm referencing `validateMagicBytes` with a FileReader wrapper.

13. **[LOW] Standardize `Research_Findings.md:57`** — Change "3-5 concurrent" to "3 concurrent" to match the settled design decision in Pseudocode and Refinement.

14. **[LOW] Document the 10MB floor rationale** in `Pseudocode.md:100` — Add a comment explaining why 10MB is used instead of the S3 API minimum of 5MB.

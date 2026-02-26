# Solution Strategy: Auto-Posting

## First Principles Analysis

**What is auto-posting at its core?**
1. Authenticate with a platform API
2. Upload a video file to that platform
3. Set metadata (title, description)
4. Track publication status
5. Collect engagement metrics

**Fundamental constraints:**
- Each platform has a unique API (no standard)
- OAuth tokens expire and need refresh
- Upload is I/O-bound (large files)
- Platform processing is async (we can't know "published" instantly)
- Rate limits vary per platform

## 5 Whys: Why is this hard?

1. Why can't users just upload manually? → Too many platforms, too repetitive
2. Why not use a third-party service? → None support Russian platforms
3. Why not build one universal adapter? → APIs are fundamentally different
4. Why is reliability critical? → Failed publishes = lost audience timing
5. Why must we handle tokens carefully? → Token leaks = account hijacking

## SCQA

- **Situation:** Users create clips in КлипМейкер
- **Complication:** Manual upload to 4 platforms takes 2+ hours
- **Question:** How to automate multi-platform publishing reliably?
- **Answer:** Adapter pattern with BullMQ queue, per-platform retry, encrypted token storage

## Architecture Decision: Adapter Pattern

Each platform gets a `PlatformProvider` implementation with standardized interface:
- `connect()` → OAuth/token setup
- `publish(file, metadata)` → Upload + publish
- `getStats(postId)` → Fetch metrics
- `refreshToken()` → Token rotation

**Why adapter pattern?**
- Adding new platforms = adding new adapter only
- Testing: mock individual adapters
- Isolation: one platform's failure doesn't affect others

## TRIZ: Contradiction Resolution

**Contradiction:** Tokens must be stored for background workers, but storing tokens is a security risk.

**TRIZ Principle #10 (Preliminary action):** Encrypt tokens at rest with server-side key. Decrypt only in worker memory at moment of use. Auto-rotate tokens via refresh flow.

**Contradiction:** Must publish to 4 platforms simultaneously, but rate limits restrict throughput.

**TRIZ Principle #1 (Segmentation):** Process each platform as independent job in BullMQ. Per-platform rate limiter. Parallel but throttled.

## Solution Synthesis

1. **Platform Connection Flow:** OAuth callback stores encrypted token → PlatformConnection record
2. **Publish Flow:** tRPC mutation → Publication record → BullMQ job → Worker → Platform API
3. **Schedule Flow:** Same as publish but with BullMQ `delay` option
4. **Stats Flow:** Cron-triggered BullMQ jobs → Worker → Platform API → Publication stats update
5. **Retry Flow:** BullMQ built-in retry (3 attempts, exponential backoff)
6. **Token Refresh:** On 401 from platform → try refresh → retry original request → if still fails → mark connection as expired

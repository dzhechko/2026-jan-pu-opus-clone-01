# Solution Strategy — Dashboard Enhancement

## Overview

Enhancement of existing КлипМейкер dashboard: fixing auth integration, adding loading states, pagination, and improved UI. This is not a greenfield build — the dashboard already has basic stats and a video list.

## Key Architectural Decisions

### 1. Auth Integration: jose JWT Decode

**Decision:** Replace `getServerSession()` with direct JWT decode via `jose.jwtVerify()` from cookies.

**Rationale:**
- `getServerSession` depends on NextAuth internals and is not Edge-compatible
- `jose` is already used in `middleware.ts` for token verification
- Direct JWT decode works in Server Components, API Routes, and Edge Runtime
- Eliminates the NextAuth dependency from the dashboard rendering path
- Single source of truth for auth: the JWT cookie set by the auth feature

**Implementation:**
```typescript
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) return null;

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload as { sub: string; email: string; name: string };
}
```

### 2. Server Components for Dashboard Page

**Decision:** Dashboard page remains a Server Component.

**Rationale:**
- Fast initial load with no client-side JavaScript for data fetching
- Direct Prisma queries in the component (no API roundtrip)
- Streaming with Suspense for progressive rendering
- Client Components used only for interactive elements (pagination controls, navigation)

### 3. React Suspense with loading.tsx

**Decision:** Use Next.js `loading.tsx` convention for streaming skeleton UI.

**Rationale:**
- `loading.tsx` is automatically wrapped in a Suspense boundary by Next.js
- Shows skeleton immediately while async Server Component resolves
- No layout shift — skeleton matches final layout dimensions
- Progressive enhancement: works without JavaScript

### 4. Offset-Based Pagination

**Decision:** Offset-based pagination instead of cursor-based.

**Rationale:**
- Dashboard displays page numbers (Page 1, 2, 3...) — offset maps naturally to this
- Users can jump to arbitrary pages (cursor requires sequential traversal)
- URL params are cleaner: `?page=3` vs cursor tokens
- tRPC already has cursor-based support, but URL params are more appropriate for dashboard UX
- Performance is acceptable: PostgreSQL OFFSET with proper indexes handles 1000s of videos efficiently
- Trade-off acknowledged: OFFSET can be slower on very large datasets, but КлипМейкер users will rarely exceed 10K videos

**Implementation:**
```typescript
const PAGE_SIZE = 10;

const videos = await prisma.video.findMany({
  where: { userId: user.sub },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * PAGE_SIZE,
  take: PAGE_SIZE,
});

const total = await prisma.video.count({
  where: { userId: user.sub },
});
```

### 5. Empty State: Inline Upload Prompt

**Decision:** Show an inline upload prompt when user has 0 videos, rather than redirecting to the upload page.

**Rationale:**
- Redirect breaks user mental model (they expect to see a dashboard)
- Inline prompt with upload CTA keeps context and educates the user
- Shows the dashboard layout so users understand what it will look like with content
- Single CTA button: "Загрузить первое видео" linking to upload page

## Component Architecture

```
app/(dashboard)/
├── layout.tsx          — Auth check, sidebar, nav (Server Component)
├── loading.tsx         — Skeleton for entire dashboard segment
├── error.tsx           — Error boundary (Client Component)
├── not-found.tsx       — 404 state
└── dashboard/
    └── page.tsx        — Stats + video list (Server Component)

components/dashboard/
├── stats-grid.tsx      — Stats cards (Server Component)
├── video-list.tsx      — Video grid/list (Server Component)
├── status-badge.tsx    — Video status indicator (Client Component for colors)
├── empty-state.tsx     — No videos prompt (Server Component)
└── pagination.tsx      — Page navigation (Client Component)
```

## Technology Choices Summary

| Concern | Choice | Alternative Rejected |
|---------|--------|---------------------|
| Auth in Server Components | jose `jwtVerify` | NextAuth `getServerSession` |
| Loading states | `loading.tsx` + Suspense | Manual loading state management |
| Pagination | Offset-based with URL params | Cursor-based with tRPC |
| Empty state | Inline prompt | Redirect to upload page |
| Skeleton UI | Tailwind `animate-pulse` | Third-party skeleton library |
| State management | Server Components (no client state) | Zustand/React Query |

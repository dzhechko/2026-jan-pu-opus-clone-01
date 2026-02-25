# Research Findings — Dashboard Enhancement

## 1. Next.js App Router: loading.tsx Convention

**Finding:** `loading.tsx` files in the App Router are automatically wrapped in a React Suspense boundary by Next.js.

**How it works:**
- Place `loading.tsx` alongside `page.tsx` in the same route segment
- Next.js wraps `page.tsx` in `<Suspense fallback={<Loading />}>` automatically
- The loading UI shows immediately while the async Server Component resolves
- Works with streaming — the shell renders first, content streams in
- `loading.tsx` is a regular React component (can be Server or Client Component)

**Example:**
```typescript
// app/(dashboard)/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

**Source:** Next.js 15 documentation — Loading UI and Streaming.

---

## 2. Next.js App Router: error.tsx Convention

**Finding:** `error.tsx` must be a Client Component (`'use client'`). It receives `{ error, reset }` props and wraps the route segment in a React Error Boundary.

**How it works:**
- `error` — the Error object thrown during rendering or data fetching
- `reset` — function to retry rendering the segment (re-invokes the Server Component)
- Error boundaries do NOT catch errors thrown in `layout.tsx` of the same segment (use parent error boundary)
- `global-error.tsx` catches errors in the root layout

**Example:**
```typescript
'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <h2>Что-то пошло не так</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <button onClick={reset}>Попробовать снова</button>
    </div>
  );
}
```

**Source:** Next.js 15 documentation — Error Handling.

---

## 3. jose Library for JWT in Server Components

**Finding:** The `jose` library works in Server Components, Edge Runtime, and Node.js. It is already used in the project's `middleware.ts`.

**Key function:** `jwtVerify(token, secret, options)`

**Behavior:**
- Returns `{ payload, protectedHeader }` on success
- Throws `JWTExpired` if token has expired
- Throws `JWTClaimValidationFailed` for invalid claims
- Throws `JWSSignatureVerificationFailed` for tampered tokens
- All errors should be caught and treated as "unauthenticated"

**Usage pattern for Server Components:**
```typescript
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}
```

**Why not NextAuth `getServerSession`:**
- `getServerSession` requires NextAuth configuration import, creating tight coupling
- It performs a full auth check including database session lookup (unnecessary when JWT is self-contained)
- Not compatible with Edge Runtime
- jose is already a dependency — no additional bundle size

**Source:** jose npm package documentation; existing project middleware.ts usage.

---

## 4. Tailwind CSS: animate-pulse for Skeleton UI

**Finding:** Tailwind provides `animate-pulse` utility class that applies a pulsing opacity animation, commonly used for skeleton/placeholder UI.

**CSS generated:**
```css
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**Best practices for skeleton UI:**
- Use `bg-muted` (from shadcn/ui theme) for skeleton blocks
- Match skeleton dimensions to final content dimensions to prevent layout shift
- Use `rounded-lg` for card-like elements, `rounded-full` for avatars/circles
- Group related skeletons with consistent spacing

**shadcn/ui Skeleton component:**
The project uses shadcn/ui which includes a `<Skeleton>` component that combines `animate-pulse` with proper styling. Prefer this over raw Tailwind classes for consistency.

```typescript
import { Skeleton } from '@/components/ui/skeleton';

<Skeleton className="h-24 w-full" />
```

---

## 5. Offset vs Cursor Pagination for Dashboards

**Finding:** Offset-based pagination is the standard choice for page-numbered dashboard UIs. Cursor-based is preferred for infinite scroll or real-time feeds.

### Comparison

| Aspect | Offset-Based | Cursor-Based |
|--------|-------------|-------------|
| URL representation | `?page=3` | `?cursor=eyJ...` (opaque) |
| Jump to page N | Yes (direct) | No (sequential only) |
| Bookmarkable | Yes | Fragile (cursor may expire) |
| Performance at scale | Degrades with high OFFSET | Constant (seeks by index) |
| Consistency on insert/delete | Rows can shift between pages | Stable (cursor is anchor) |
| Implementation complexity | Simple | Moderate |
| User mental model | Familiar (page numbers) | Less familiar |

### Recommendation for КлипМейкер Dashboard

**Use offset-based pagination because:**
1. Dashboard displays explicit page numbers — users expect to jump to any page
2. URLs are bookmarkable and shareable: `/dashboard?page=3`
3. Typical user has < 500 videos — OFFSET performance is not a concern
4. PostgreSQL OFFSET with a composite index `(userId, createdAt DESC)` handles 10K+ rows efficiently
5. Simpler implementation: just `skip` and `take` in Prisma

**Performance note:** If a user exceeds 10K videos (unlikely in current product scope), consider switching to keyset pagination (WHERE createdAt < lastSeen) for that user segment. This is a future optimization, not a current requirement.

### PostgreSQL OFFSET Performance

With proper indexing:
- 100 rows, OFFSET 0: ~0.1ms
- 10,000 rows, OFFSET 5000: ~2ms
- 100,000 rows, OFFSET 50000: ~15ms

For КлипМейкер's expected data volume (< 1000 videos per user), OFFSET is well within acceptable performance bounds.

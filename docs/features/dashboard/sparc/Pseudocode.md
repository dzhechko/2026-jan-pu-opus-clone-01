# Dashboard — Pseudocode

## Overview

Pseudocode for all dashboard components, covering auth integration, stats display, video list with pagination, status badges, loading skeletons, and error boundaries.

---

## 1. Dashboard Layout Auth

**File:** `apps/web/app/(dashboard)/layout.tsx`

Replaces `getServerSession(authOptions)` with direct JWT decoding via jose.

```
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'
import { DashboardNav } from '@/components/layout/dashboard-nav'

type DashboardUser = {
  id: string
  email: string
  planId: string
}

JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

async function DashboardLayout({ children }):
  cookieStore = await cookies()
  accessToken = cookieStore.get('access_token')?.value

  if !accessToken:
    redirect('/login')

  try:
    { payload } = await jwtVerify(accessToken, JWT_SECRET)
    user: DashboardUser = {
      id: payload.sub as string,
      email: payload.email as string,
      planId: payload.planId as string,
    }
  catch (error):
    // Token expired or invalid — redirect to login
    // The /login page can attempt refresh if refresh_token exists
    redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav user={user} />
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )

export default DashboardLayout
```

---

## 2. Dashboard Page (Enhanced Stats + Paginated Videos)

**File:** `apps/web/app/(dashboard)/dashboard/page.tsx`

Server Component with parallel Prisma queries and pagination via searchParams.

```
import { headers } from 'next/headers'
import { prisma } from '@clipmaker/db'
import { StatsGrid } from '@/components/dashboard/stats-grid'
import { VideoList } from '@/components/dashboard/video-list'
import { EmptyState } from '@/components/dashboard/empty-state'

PAGE_SIZE = 10

async function DashboardPage({ searchParams }):
  headerStore = await headers()
  userId = headerStore.get('x-user-id')

  // Parse and validate page number
  rawPage = (await searchParams).page
  page = Math.max(1, parseInt(rawPage) || 1)
  offset = (page - 1) * PAGE_SIZE

  // Parallel queries — all independent, no waterfall
  [user, videoCount, clipCount, videos] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        minutesUsed: true,
        minutesLimit: true,
        plan: { select: { id: true, name: true, displayName: true } },
        billingPeriodStart: true,
      },
    }),

    prisma.video.count({
      where: { userId },
    }),

    prisma.clip.count({
      where: { video: { userId } },
    }),

    prisma.video.findMany({
      where: { userId },
      take: PAGE_SIZE + 1,           // Fetch one extra to determine hasMore
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        durationSeconds: true,
        thumbnailUrl: true,
        createdAt: true,
        _count: { select: { clips: true } },
      },
    }),
  ])

  hasMore = videos.length > PAGE_SIZE
  displayVideos = videos.slice(0, PAGE_SIZE)
  totalPages = Math.ceil(videoCount / PAGE_SIZE)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Дашборд</h1>

      <StatsGrid
        user={user}
        videoCount={videoCount}
        clipCount={clipCount}
      />

      {videoCount === 0 ? (
        <EmptyState />
      ) : (
        <VideoList
          videos={displayVideos}
          currentPage={page}
          totalPages={totalPages}
          hasMore={hasMore}
        />
      )}
    </div>
  )

export default DashboardPage
```

---

## 3. StatsGrid Component

**File:** `apps/web/components/dashboard/stats-grid.tsx`

Displays usage statistics in a responsive grid with a progress bar variant for minutes.

```
import { StatCard } from './stat-card'
import { MinutesCard } from './minutes-card'
import { PlanBadge } from './plan-badge'
import { VideoIcon, ScissorsIcon, SparklesIcon } from 'lucide-react'

type StatsGridProps = {
  user: {
    minutesUsed: number
    minutesLimit: number
    plan: { id: string; name: string; displayName: string }
    billingPeriodStart: Date
  }
  videoCount: number
  clipCount: number
}

function StatsGrid({ user, videoCount, clipCount }):
  // Calculate billing period end (30 days from start)
  billingPeriodEnd = new Date(user.billingPeriodStart)
  billingPeriodEnd.setDate(billingPeriodEnd.getDate() + 30)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MinutesCard
        minutesUsed={user.minutesUsed}
        minutesLimit={user.minutesLimit}
      />

      <StatCard
        icon={<ScissorsIcon />}
        label="Клипов создано"
        value={clipCount}
      />

      <PlanBadge
        planName={user.plan.displayName}
        planId={user.plan.id}
        billingPeriodEnd={billingPeriodEnd}
        videoCount={videoCount}
      />
    </div>
  )

export { StatsGrid }
```

### MinutesCard (progress variant)

**File:** `apps/web/components/dashboard/minutes-card.tsx`

```
import { ClockIcon } from 'lucide-react'

type MinutesCardProps = {
  minutesUsed: number
  minutesLimit: number
}

function MinutesCard({ minutesUsed, minutesLimit }):
  percentage = minutesLimit > 0
    ? Math.round((minutesUsed / minutesLimit) * 100)
    : 0

  // Color thresholds: green < 70%, yellow 70-90%, red > 90%
  progressColor =
    percentage >= 90 ? 'bg-red-500'
    : percentage >= 70 ? 'bg-yellow-500'
    : 'bg-green-500'

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <ClockIcon className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Минуты обработки</span>
      </div>

      <div className="text-2xl font-bold mb-2">
        {minutesUsed} / {minutesLimit} мин
      </div>

      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progressColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      <div className="mt-1 text-xs text-muted-foreground text-right">
        {percentage}% использовано
      </div>
    </div>
  )

export { MinutesCard }
```

### StatCard (generic)

**File:** `apps/web/components/dashboard/stat-card.tsx`

```
import { type ReactNode } from 'react'

type StatCardProps = {
  icon: ReactNode
  label: string
  value: number | string
}

function StatCard({ icon, label, value }):
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-5 w-5 text-muted-foreground">{icon}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )

export { StatCard }
```

### PlanBadge

**File:** `apps/web/components/dashboard/plan-badge.tsx`

```
import { SparklesIcon } from 'lucide-react'

PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  business: 'bg-amber-100 text-amber-700',
}

type PlanBadgeProps = {
  planName: string
  planId: string
  billingPeriodEnd: Date
  videoCount: number
}

function PlanBadge({ planName, planId, billingPeriodEnd, videoCount }):
  colorClass = PLAN_COLORS[planId] ?? PLAN_COLORS.free
  daysLeft = Math.max(0, Math.ceil(
    (billingPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ))

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <SparklesIcon className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Тарифный план</span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
          {planName}
        </span>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>{videoCount} видео обработано</div>
        <div>Осталось {daysLeft} дней до обновления</div>
      </div>
    </div>
  )

export { PlanBadge }
```

---

## 4. VideoList with Pagination

**File:** `apps/web/components/dashboard/video-list.tsx`

```
import { VideoRow } from './video-row'
import { PaginationControls } from './pagination-controls'

type Video = {
  id: string
  title: string
  status: string
  durationSeconds: number
  thumbnailUrl: string | null
  createdAt: Date
  _count: { clips: number }
}

type VideoListProps = {
  videos: Video[]
  currentPage: number
  totalPages: number
  hasMore: boolean
}

function VideoList({ videos, currentPage, totalPages, hasMore }):
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Ваши видео</h2>

      <div className="rounded-xl border bg-white shadow-sm divide-y">
        {videos.map(video => (
          <VideoRow key={video.id} video={video} />
        ))}
      </div>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        hasMore={hasMore}
      />
    </div>
  )

export { VideoList }
```

### VideoRow

**File:** `apps/web/components/dashboard/video-row.tsx`

```
import Link from 'next/link'
import { StatusBadge } from './status-badge'
import { VideoThumbnail } from './video-thumbnail'
import { formatDuration, formatRelativeDate } from '@/lib/utils/format'

type VideoRowProps = {
  video: {
    id: string
    title: string
    status: string
    durationSeconds: number
    thumbnailUrl: string | null
    createdAt: Date
    _count: { clips: number }
  }
}

function VideoRow({ video }):
  return (
    <Link
      href={`/dashboard/videos/${video.id}`}
      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
    >
      <VideoThumbnail
        src={video.thumbnailUrl}
        alt={video.title}
      />

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{video.title}</div>
        <div className="text-sm text-muted-foreground">
          {formatDuration(video.durationSeconds)} &middot; {video._count.clips} клипов
        </div>
      </div>

      <StatusBadge status={video.status} />

      <div className="text-sm text-muted-foreground whitespace-nowrap">
        {formatRelativeDate(video.createdAt)}
      </div>
    </Link>
  )

export { VideoRow }
```

### PaginationControls

**File:** `apps/web/components/dashboard/pagination-controls.tsx`

Client Component — uses `useRouter` for navigation without full page reload.

```
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

type PaginationControlsProps = {
  currentPage: number
  totalPages: number
  hasMore: boolean
}

function PaginationControls({ currentPage, totalPages, hasMore }):
  router = useRouter()
  pathname = usePathname()
  searchParams = useSearchParams()

  function navigateToPage(page: number):
    params = new URLSearchParams(searchParams.toString())
    if page === 1:
      params.delete('page')
    else:
      params.set('page', page.toString())
    router.push(`${pathname}?${params.toString()}`)

  hasPrev = currentPage > 1

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Страница {currentPage} из {totalPages}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={!hasPrev}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm
                     rounded-lg border hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:pointer-events-none"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Назад
        </button>

        <button
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={!hasMore}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm
                     rounded-lg border hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:pointer-events-none"
        >
          Вперёд
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

export { PaginationControls }
```

---

## 5. StatusBadge

**File:** `apps/web/components/dashboard/status-badge.tsx`

Localized Russian labels with semantic colors.

```
type StatusConfig = {
  label: string
  className: string
}

STATUS_MAP: Record<string, StatusConfig> = {
  uploading: {
    label: 'Загрузка',
    className: 'bg-blue-100 text-blue-700',
  },
  transcribing: {
    label: 'Транскрибация',
    className: 'bg-blue-100 text-blue-700',
  },
  analyzing: {
    label: 'Анализ',
    className: 'bg-purple-100 text-purple-700',
  },
  generating_clips: {
    label: 'Генерация',
    className: 'bg-purple-100 text-purple-700',
  },
  completed: {
    label: 'Готово',
    className: 'bg-green-100 text-green-700',
  },
  failed: {
    label: 'Ошибка',
    className: 'bg-red-100 text-red-700',
  },
}

FALLBACK_STATUS: StatusConfig = {
  label: 'Неизвестно',
  className: 'bg-gray-100 text-gray-700',
}

type StatusBadgeProps = {
  status: string
}

function StatusBadge({ status }):
  config = STATUS_MAP[status] ?? FALLBACK_STATUS

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )

export { StatusBadge }
```

---

## 6. DashboardNav Logout

**File:** `apps/web/components/layout/dashboard-nav.tsx` (modify existing)

Replace NextAuth `signOut` with custom logout handler.

```
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LogOutIcon, VideoIcon, SettingsIcon, UploadIcon } from 'lucide-react'

type DashboardUser = {
  id: string
  email: string
  planId: string
}

type DashboardNavProps = {
  user: DashboardUser
}

function DashboardNav({ user }):
  [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout():
    if isLoggingOut:
      return
    setIsLoggingOut(true)
    try:
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
    catch (error):
      // Even if logout request fails, redirect to login
      // The access_token will expire naturally (15 min TTL)
      console.error('Logout request failed:', error)
    finally:
      window.location.href = '/login'

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold">
            КлипМейкер
          </Link>
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <VideoIcon className="h-4 w-4" />
            Видео
          </Link>
          <Link href="/dashboard/upload" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <UploadIcon className="h-4 w-4" />
            Загрузить
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Link href="/dashboard/settings" className="text-muted-foreground hover:text-foreground">
            <SettingsIcon className="h-5 w-5" />
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Выйти"
          >
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </nav>
  )

export { DashboardNav }
```

---

## 7. Loading Skeleton

**File:** `apps/web/app/(dashboard)/dashboard/loading.tsx`

Shown instantly during navigation while the page component awaits Prisma queries.

```
function DashboardLoading():
  return (
    <div className="space-y-8 animate-pulse">
      {/* Title skeleton */}
      <div className="h-8 w-40 bg-gray-200 rounded" />

      {/* Stats grid skeleton: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
            <div className="h-7 w-20 bg-gray-200 rounded" />
            <div className="h-2 w-full bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>

      {/* Section title skeleton */}
      <div className="h-6 w-32 bg-gray-200 rounded" />

      {/* Video list skeleton: 10 rows */}
      <div className="rounded-xl border bg-white shadow-sm divide-y">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            {/* Thumbnail skeleton */}
            <div className="h-12 w-20 bg-gray-200 rounded" />
            {/* Content skeleton */}
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/3 bg-gray-200 rounded" />
            </div>
            {/* Badge skeleton */}
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            {/* Date skeleton */}
            <div className="h-4 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  )

export default DashboardLoading
```

---

## 8. Error Boundary

**File:** `apps/web/app/(dashboard)/dashboard/error.tsx`

Must be a Client Component. Provides localized error message and retry.

```
'use client'

import { useEffect } from 'react'
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react'

type DashboardErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

function DashboardError({ error, reset }):
  useEffect(() => {
    // Log error to monitoring service (Sentry, etc.)
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <AlertCircleIcon className="h-12 w-12 text-red-500" />

      <h2 className="text-xl font-semibold">Произошла ошибка</h2>

      <p className="text-muted-foreground text-center max-w-md">
        Не удалось загрузить данные дашборда. Попробуйте обновить страницу.
        Если проблема сохраняется, обратитесь в поддержку.
      </p>

      {error.digest && (
        <p className="text-xs text-muted-foreground">
          Код ошибки: {error.digest}
        </p>
      )}

      <button
        onClick={reset}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                   bg-primary text-primary-foreground hover:bg-primary/90
                   transition-colors"
      >
        <RefreshCwIcon className="h-4 w-4" />
        Попробовать снова
      </button>
    </div>
  )

export default DashboardError
```

---

## 9. Not Found Page

**File:** `apps/web/app/(dashboard)/dashboard/not-found.tsx`

```
import Link from 'next/link'
import { FileQuestionIcon } from 'lucide-react'

function DashboardNotFound():
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <FileQuestionIcon className="h-12 w-12 text-muted-foreground" />

      <h2 className="text-xl font-semibold">Страница не найдена</h2>

      <p className="text-muted-foreground text-center max-w-md">
        Запрашиваемая страница не существует или была удалена.
      </p>

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                   bg-primary text-primary-foreground hover:bg-primary/90
                   transition-colors"
      >
        Вернуться на дашборд
      </Link>
    </div>
  )

export default DashboardNotFound
```

---

## 10. Empty State

**File:** `apps/web/components/dashboard/empty-state.tsx`

Shown when the user has no videos yet.

```
import Link from 'next/link'
import { UploadCloudIcon } from 'lucide-react'

function EmptyState():
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px]
                    rounded-xl border border-dashed bg-white p-12 space-y-4">
      <UploadCloudIcon className="h-16 w-16 text-muted-foreground/50" />

      <h3 className="text-lg font-semibold">У вас пока нет видео</h3>

      <p className="text-muted-foreground text-center max-w-sm">
        Загрузите первый вебинар, и КлипМейкер автоматически
        создаст из него промо-шортсы с субтитрами.
      </p>

      <Link
        href="/dashboard/upload"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg
                   bg-primary text-primary-foreground hover:bg-primary/90
                   transition-colors font-medium"
      >
        <UploadCloudIcon className="h-5 w-5" />
        Загрузить видео
      </Link>
    </div>
  )

export { EmptyState }
```

---

## 11. Video Thumbnail

**File:** `apps/web/components/dashboard/video-thumbnail.tsx`

```
import Image from 'next/image'
import { FilmIcon } from 'lucide-react'

type VideoThumbnailProps = {
  src: string | null
  alt: string
}

function VideoThumbnail({ src, alt }):
  if !src:
    return (
      <div className="h-12 w-20 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
        <FilmIcon className="h-5 w-5 text-muted-foreground/50" />
      </div>
    )

  return (
    <div className="h-12 w-20 rounded overflow-hidden flex-shrink-0 relative">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="80px"
        className="object-cover"
      />
    </div>
  )

export { VideoThumbnail }
```

---

## 12. Utility Functions

**File:** `apps/web/lib/utils/format.ts` (create or extend)

```
/**
 * Format seconds into human-readable duration.
 * Examples: 65 → "1:05", 3661 → "1:01:01"
 */
function formatDuration(totalSeconds: number): string:
  hours = Math.floor(totalSeconds / 3600)
  minutes = Math.floor((totalSeconds % 3600) / 60)
  seconds = totalSeconds % 60

  if hours > 0:
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`

/**
 * Format a date into relative Russian string.
 * Examples: "только что", "5 мин назад", "2 часа назад", "вчера", "15 янв"
 */
function formatRelativeDate(date: Date): string:
  now = new Date()
  diffMs = now.getTime() - date.getTime()
  diffMinutes = Math.floor(diffMs / 60000)
  diffHours = Math.floor(diffMs / 3600000)
  diffDays = Math.floor(diffMs / 86400000)

  if diffMinutes < 1:
    return 'только что'
  if diffMinutes < 60:
    return `${diffMinutes} мин назад`
  if diffHours < 24:
    return `${diffHours} ч назад`
  if diffDays === 1:
    return 'вчера'
  if diffDays < 7:
    return `${diffDays} дн назад`

  // For older dates, format as "15 янв" or "15 янв 2025"
  MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  day = date.getDate()
  month = MONTHS[date.getMonth()]

  if date.getFullYear() === now.getFullYear():
    return `${day} ${month}`
  return `${day} ${month} ${date.getFullYear()}`

export { formatDuration, formatRelativeDate }
```

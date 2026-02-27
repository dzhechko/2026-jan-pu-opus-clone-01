# ClipMaker UI Overview

## Contents

1. [Dashboard Layout](#1-dashboard-layout)
2. [Pages Overview](#2-pages-overview)
3. [Video Upload](#3-video-upload)
4. [Video Detail and Clips](#4-video-detail-and-clips)
5. [Clip Cards](#5-clip-cards)
6. [Clip Editor](#6-clip-editor)
7. [Analytics Dashboard](#7-analytics-dashboard)
8. [Billing Page](#8-billing-page)
9. [Platform Connections](#9-platform-connections)
10. [Team Management](#10-team-management)
11. [Settings](#11-settings)
12. [BYOK Key Management](#12-byok-key-management)
13. [Loading States and Skeletons](#13-loading-states-and-skeletons)
14. [Component Library](#14-component-library)

---

## 1. Dashboard Layout

The dashboard uses a top navigation bar with a white background and border bottom. The layout consists of:

- **Left side**: Logo ("ClipMaker") followed by primary navigation links.
- **Right side**: User email, settings gear icon, and logout button.

### Navigation Links

| Link | Icon | Route | Purpose |
|------|------|-------|---------|
| Videos | VideoIcon | `/dashboard` | Main video list |
| Upload | UploadIcon | `/dashboard/upload` | Upload new video |
| Analytics | BarChart3Icon | `/dashboard/analytics` | Publication analytics |
| Team | UsersIcon | `/dashboard/team` | Team management |
| Settings | SettingsIcon | `/dashboard/settings` | Profile and preferences |

The main content area renders below the navigation bar within a container layout.

---

## 2. Pages Overview

### App Router Structure

```
app/
+-- page.tsx                                       # / (landing page)
+-- layout.tsx                                     # Root layout
+-- (auth)/
|   +-- layout.tsx                                 # Auth layout (centered)
|   +-- login/page.tsx                             # /login
|   +-- register/page.tsx                          # /register
|   +-- forgot-password/page.tsx                   # /forgot-password
|   +-- reset-password/page.tsx                    # /reset-password
|   +-- verify-email/page.tsx                      # /verify-email
+-- (dashboard)/
|   +-- layout.tsx                                 # Dashboard layout (nav)
|   +-- dashboard/
|       +-- page.tsx                               # /dashboard (video list)
|       +-- upload/page.tsx                        # /dashboard/upload
|       +-- analytics/page.tsx                     # /dashboard/analytics
|       +-- billing/page.tsx                       # /dashboard/billing
|       +-- team/page.tsx                          # /dashboard/team
|       +-- settings/
|       |   +-- page.tsx                           # /dashboard/settings
|       |   +-- platforms/page.tsx                 # /dashboard/settings/platforms
|       |   +-- api-keys/page.tsx                  # /dashboard/settings/api-keys
|       +-- videos/
|           +-- [videoId]/
|               +-- page.tsx                       # /dashboard/videos/:id
|               +-- clips/[clipId]/edit/page.tsx   # Clip editor
+-- api/                                           # API routes
+-- invite/page.tsx                                # /invite (team invite)
```

### Rendering Strategy

| Page Type | Rendering | Example |
|-----------|----------|---------|
| Landing, SEO | SSR (Server-Side Rendering) | `/` |
| Authentication | Server Components | `/login`, `/register` |
| Dashboard | Client Components | `/dashboard/*` |
| API | Server-side | `/api/*` |

---

## 3. Video Upload

The upload page (`/dashboard/upload`) provides two modes controlled by toggle buttons:

### File Upload Mode

- **Drag and drop zone**: Large dashed-border area with "Drop video here" text.
- **File picker**: "Choose file" button opens the system file dialog.
- **Supported formats**: MP4, WebM, MOV, AVI (up to 4 GB).
- **Validation**: Client-side magic bytes check before upload begins. MIME type and file size checks.

### URL Mode

- **URL input field**: Paste a video URL (e.g., VK video link).
- **Submit button**: Triggers server-side download of the video.

### Upload Progress

During upload, the drag-and-drop zone transforms into a progress panel:

- **Status text**: "Validating...", "Uploading: XX%", or "Confirming...".
- **Progress bar**: Animated bar with percentage.
- **Speed and ETA**: Shows current upload speed (MB/s) and estimated time remaining.
- **Cancel button**: Aborts the upload and cleans up server-side state.
- **Multipart upload**: Large files are split into parts and uploaded concurrently (3 parallel parts).
- **Browser unload warning**: Warns the user if they attempt to close the tab during upload.

After successful upload, the user is automatically redirected to the video detail page where processing begins.

---

## 4. Video Detail and Clips

The video detail page (`/dashboard/videos/:id`) shows:

### Video Header

- Video title and metadata (duration, creation date).
- Video processing status badge (uploading, transcribing, analyzing, generating clips, completed, failed).
- Delete button with confirmation dialog (cascades to S3 cleanup and database deletion).

### Transcript Viewer

- Collapsible transcript section.
- Displays the full text with timed segments.
- Segment editor for editing individual transcript segments.

### Clip List

- Grid of clip cards (see section 5).
- Each clip displays its title, duration, virality score, status, and action buttons.
- Real-time status polling: the page polls for video status updates while processing is in progress, and automatically redirects when processing completes.

---

## 5. Clip Cards

Each clip is displayed as a vertical card with a 9:16 aspect ratio preview area.

### Card Structure

```
+------------------------+
|                        |
|   9:16 Preview Area    |
|   (thumbnail or        |
|    inline video)       |
|                        |
|   [Play button overlay]|
|   [Watermark badge]    |
+------------------------+
|  Title (truncated)     |
|  Duration    Score     |
|  CTA: "Call to action" |
|  Status: Ready         |
|  [VK][Rutube][TG]      |
|                        |
|  [Download] [Publish]  |
+------------------------+
```

### Features

- **Inline video player**: Clicking the preview area starts playback within the card. No page navigation needed.
- **Watermark badge**: Free plan users see a clickable "Watermark" badge linking to the billing page.
- **Virality score badge**: Color-coded score (green/yellow/red) with breakdown on hover (hook, engagement, flow, trend).
- **CTA indicator**: If the AI generated a call-to-action, it appears as a blue chip below the score.
- **Publication badges**: Small colored badges for each platform where the clip has been published. Green for published, yellow for scheduled, blue for publishing, red for failed. Published badges link to the platform post.
- **Download button**: Downloads the rendered MP4. Shows a loading state during download. Disabled if the clip is not yet ready.
- **Publish button**: Opens the publish dialog (see auto-posting).
- **Status labels**: "In queue", "Rendering...", "Ready", "Published", "Error".

---

## 6. Clip Editor

The clip editor page (`/dashboard/videos/:videoId/clips/:clipId/edit`) provides a detailed editing interface:

### Components

| Component | Purpose |
|-----------|---------|
| Video Preview | Full clip playback with controls |
| Timeline | Visual timeline showing clip boundaries within the source video |
| Subtitle Editor | Edit subtitle text, timing, and styling |
| Metadata Panel | Edit title, description, CTA text |
| Action Bar | Save, re-render, download actions |

---

## 7. Analytics Dashboard

The analytics page (`/dashboard/analytics`) shows publication performance data.

### Header

- Page title "Analytics".
- Date range picker (dropdown: 7, 14, 30, 60, 90 days).
- Refresh button with spinning animation during data load.

### Overview Cards

A 4-column grid of stat cards:

| Card | Metric |
|------|--------|
| Total Views | Sum of views across all published clips |
| Total Likes | Sum of likes across all published clips |
| Total Shares | Sum of shares across all published clips |
| Published | Total number of published clips |

### Platform Table

Breakdown of views, likes, and shares by platform (VK, Rutube, Dzen, Telegram).

### Top Clips Table

Ranked list of the 10 best-performing clips by views, with title, platform, and engagement metrics.

### Timeline Chart

Line chart showing publication activity and views over the selected date range.

### Empty State

When there are no published clips yet, the page displays an empty state with an illustration and a prompt to publish clips.

### Loading State

While data is fetching, the page displays skeleton cards (animated gray placeholders) in the same 4-column grid layout, followed by a skeleton content block.

---

## 8. Billing Page

The billing page (`/dashboard/billing`) manages subscriptions and payments.

### Plan Comparison Table

A responsive 4-column grid showing all plans side by side:

| Element | Description |
|---------|------------|
| Plan name | Free, Start, Pro, Business |
| Price | "Free" or "X RUB/month" |
| Features list | Minutes/month, max clips, watermark, storage days |
| Action button | "Current plan" (highlighted), "Upgrade to X", or "--" (for downgrades) |

The current plan card has a blue border with a ring highlight.

### Subscription Card

Displayed only for paid subscribers. Shows:

- Current plan name and status.
- Payment method (Card or SBP).
- Next billing date (or "--" if cancellation is pending).
- "Cancel subscription" button (with confirmation dialog showing the active-until date).
- "Reactivate subscription" button (shown when cancellation is pending).
- Warning banner for past-due subscriptions.

### Checkout Modal

Opens when a user clicks "Upgrade to X":

- Plan name and price display.
- Payment method selection: Bank Card (Visa, Mastercard, MIR) or SBP.
- "Pay X RUB" button initiates checkout.
- For cards: redirects to YooKassa hosted payment page.
- For SBP: displays a QR code with automatic status polling (every 3 seconds, 10-minute timeout). Shows timeout message if expired.

### Extra Minutes Card

Appears when the user has fewer than 10 minutes remaining:

- Warning message in amber styling.
- Quick-buy buttons: 30 min, 60 min, 120 min with prices.

---

## 9. Platform Connections

The platforms page (`/dashboard/settings/platforms`) manages connections to publishing platforms.

### Platform Cards

Four platform cards are displayed vertically:

| Platform | Auth Type | Details |
|----------|----------|---------|
| VK Clips | OAuth | Redirect to VK OAuth flow |
| Rutube | Token | Manual API token input |
| Dzen | OAuth | Redirect to Yandex OAuth flow |
| Telegram | Token | Bot token + optional channel ID |

### Card States

**Disconnected**: Shows a "Connect" button. For token-based platforms, clicking opens an inline form with a masked input field and help text explaining where to obtain the token.

**Connected**: Shows:
- Green "Connected" badge.
- Account name (if available).
- "Test" button to verify the connection is still valid.
- "Disconnect" button with confirmation dialog.

**Plan restriction**: If the current plan does not include a platform, the card appears dimmed (60% opacity) with "Not available on your plan" text and an "Upgrade plan" link.

### Plan Upgrade Banner

If no platforms are available on the current plan, a prominent amber banner appears at the top explaining the limitation and linking to the billing page.

### Dev Mode Notice

In development environments, a blue info banner explains that OAuth platforms (VK, Dzen) use simulated connections since real OAuth requires public redirect URLs.

---

## 10. Team Management

The team page (`/dashboard/team`) provides team creation and member management.

### No Team State

When the user has no team:
- Large centered empty state with a Users icon.
- "No team" heading with description text.
- "Create a team" form below (available on Pro and Business plans).

### Team View

When a team exists:

**Header**:
- Team name as the page title.
- "Leave team" button (for non-owner members).
- "Delete team" button (for the owner only, with red styling and confirmation).

**Member List**:
- List of all team members with their email, role badge (owner/admin/member), and join date.
- Pending invites shown separately with expiration date.
- Owner and admin users can change member roles or remove members.

**Invite Form**:
- Visible only to owners and admins.
- Email input field with role selector (admin or member).
- Send invite button.
- Invites are sent by email with a unique token link.

### Invite Acceptance

The `/invite` page handles team invite tokens:
- Validates the token.
- If the user is logged in, accepts the invite and redirects to the team page.
- If not logged in, prompts for login or registration first.

---

## 11. Settings

The settings page (`/dashboard/settings`) serves as a hub for user preferences.

### AI Provider Selection

Two radio-button options in a card:

| Option | Description |
|--------|------------|
| Cloud.ru (Russia) | All data stays in Russia. ~21 RUB per 60 min |
| Global (Gemini, Claude, OpenAI) | Transcripts in US/EU. ~55 RUB per 60 min |

Selecting "Global" triggers a confirmation dialog warning that transcripts will be processed outside Russia.

### BYOK API Keys Section

A card with a link to the API keys management page (`/dashboard/settings/api-keys`). The "Manage keys" button is only active when the Global strategy is selected; otherwise it appears as a disabled gray button with "Available with Global strategy" text.

### Platforms Section

A card with a link to the platform connections page (`/dashboard/settings/platforms`). Always active with a "Manage" button.

---

## 12. BYOK Key Management

The API keys page (`/dashboard/settings/api-keys`) allows users to add, test, and remove their own API keys for AI providers.

### BYOK Keys Panel

Displays a list of supported providers:

- **Gemini** (Google)
- **OpenAI** (for Whisper STT and models)
- **Anthropic** (Claude)
- **OpenRouter** (unified gateway, fallback)

For each provider:
- **Not configured**: "Add key" button.
- **Configured**: Masked key display (showing only the last 4 characters), "Test" button, and "Remove" button.
- **Testing**: Verification spinner followed by success/failure feedback.

### Security Model

All keys are encrypted client-side using AES-GCM 256-bit before being stored in IndexedDB. The encryption key is derived from the user's password via PBKDF2 (100K+ iterations). The master key is held in memory only and auto-clears after 30 minutes of inactivity. The server never sees or stores plaintext keys.

---

## 13. Loading States and Skeletons

Every dashboard page implements loading skeletons for a smooth user experience:

| Page | Skeleton Description |
|------|---------------------|
| Dashboard (video list) | Animated gray cards in a grid |
| Video detail | Header skeleton + clip card placeholders |
| Upload | Full-width progress bar during upload |
| Analytics | 4 skeleton stat cards + content block |
| Billing | Plan card skeletons |
| Settings | Card section skeletons |
| Team | Card with title and content placeholders |
| Clip editor | Player skeleton + panel placeholders |

Skeletons use Tailwind's `animate-pulse` class for a consistent shimmer effect across all pages.

### Error States

- Each page has a dedicated `error.tsx` boundary that catches runtime errors and displays a user-friendly error message with a retry option.
- Each page has a `not-found.tsx` page for invalid IDs (e.g., nonexistent video or clip).

---

## 14. Component Library

### Framework

- **shadcn/ui** as the component foundation (button, card, badge, separator, and more).
- **Tailwind CSS** for all styling -- no CSS modules or styled-components.
- **Lucide React** for all icons (VideoIcon, UploadIcon, BarChart3Icon, UsersIcon, SettingsIcon, LogOutIcon, RefreshCwIcon, TrashIcon, etc.).

### Core UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Button | `components/ui/button.tsx` | Primary, secondary, destructive variants |
| Card | `components/ui/card.tsx` | Content container with border and shadow |
| Badge | `components/ui/badge.tsx` | Status labels and tags |
| Separator | `components/ui/separator.tsx` | Visual divider |

### Domain Components

| Component | Location | Purpose |
|-----------|----------|---------|
| DashboardNav | `components/layout/dashboard-nav.tsx` | Top navigation bar |
| VideoUploader | `components/upload/video-uploader.tsx` | Drag-and-drop + URL upload |
| VideoList | `components/dashboard/video-list.tsx` | Paginated video grid |
| VideoRow | `components/dashboard/video-row.tsx` | Single video in the list |
| VideoDetail | `components/video/video-detail.tsx` | Video detail with clips |
| VideoHeader | `components/video/video-header.tsx` | Video metadata and actions |
| ClipCard | `components/clips/clip-card.tsx` | Individual clip display |
| ClipList | `components/clips/clip-list.tsx` | Grid of clip cards |
| PublishDialog | `components/clips/publish-dialog.tsx` | Platform selection for publishing |
| ViralityBreakdown | `components/clips/virality-breakdown.tsx` | Score badge and breakdown |
| TranscriptViewer | `components/transcript/transcript-viewer.tsx` | Collapsible transcript |
| SegmentEditor | `components/transcript/segment-editor.tsx` | Edit transcript segments |
| OverviewCards | `components/analytics/overview-cards.tsx` | Analytics stat cards |
| PlatformTable | `components/analytics/platform-table.tsx` | Per-platform stats |
| TopClipsTable | `components/analytics/top-clips-table.tsx` | Best performing clips |
| TimelineChart | `components/analytics/timeline-chart.tsx` | Views over time chart |
| DateRangePicker | `components/analytics/date-range-picker.tsx` | Date range dropdown |
| ByokKeysPanel | `components/settings/byok-keys-panel.tsx` | API key management |
| CreateTeamForm | `components/team/create-team-form.tsx` | Team creation form |
| MemberList | `components/team/member-list.tsx` | Team member list |
| InviteMemberForm | `components/team/invite-member-form.tsx` | Invite by email |
| StatCard | `components/dashboard/stat-card.tsx` | Reusable metric card |
| StatsGrid | `components/dashboard/stats-grid.tsx` | Grid of stat cards |
| MinutesCard | `components/dashboard/minutes-card.tsx` | Minutes usage display |
| PlanBadge | `components/dashboard/plan-badge.tsx` | Current plan indicator |
| StatusBadge | `components/dashboard/status-badge.tsx` | Processing status |
| PaginationControls | `components/dashboard/pagination-controls.tsx` | Page navigation |
| EmptyState | `components/dashboard/empty-state.tsx` | No-data placeholder |

### Responsive Design

- Dashboard navigation collapses on smaller screens.
- Plan comparison grid: 4 columns on desktop, 2 on tablet, 1 on mobile.
- Clip card grid: adaptive columns based on viewport width.
- All forms and cards use `max-w-2xl` for comfortable reading width.
- Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) are used throughout.

---

## Dev vs Production Environment Differences

This section describes the UI elements that differ between development and production environments.

### UI Comparison

| UI Element | Development | Production |
|------------|-------------|------------|
| **Platform Page Banner** | Blue info banner explaining that OAuth platforms use simulated connections | No banner -- real OAuth connections only |
| **Platform Connection Badges** | Connected platforms show a "(dev)" badge indicating simulated connections | Standard "Connected" green badge |
| **Team Invite Link** | Invite link is displayed directly in the UI after sending (since Ethereal does not deliver emails) | Invite link sent by email only -- not displayed in the UI |
| **Email Preview URLs** | When the system sends an email, the Ethereal preview URL is logged to the console | Real emails delivered to inboxes -- no preview URLs |
| **Registration Flow** | Email auto-verified on registration -- user skips the verification step | User must click verification link in email before logging in |
| **Payment Buttons** | "Upgrade" buttons on the billing page will fail without YooKassa credentials | Full checkout flow with YooKassa payment page or SBP QR code |

### Dev-Mode Banner on Platforms Page

When running in development, the Platforms page (`/dashboard/settings/platforms`) displays a prominent blue information banner at the top:

```
+------------------------------------------------------------------+
| [info icon] Development Mode                                      |
|                                                                    |
| OAuth platforms (VK, Dzen) use simulated connections since real    |
| OAuth requires public redirect URLs. Token-based platforms         |
| (Rutube, Telegram) work normally.                                  |
+------------------------------------------------------------------+
```

This banner does not appear in production.

### "(dev)" Badges on Simulated Connections

In development, OAuth-based platforms (VK and Dzen) use simulated connections. When a user clicks "Connect" for VK or Dzen, the system creates a fake connection record instead of redirecting to a real OAuth provider. The connection card displays:

- A "(dev)" badge next to the platform name.
- A green "Connected" status, but the connection is simulated.
- The "Test" button may return a simulated success response.

In production, these badges do not appear. Connections go through the real OAuth flow with VK ID and Yandex OAuth.

### Invite Link Display in Dev

In development, after sending a team invite, the invite link (e.g., `http://localhost:3000/invite?token=abc123...`) is displayed in the UI. This is because Ethereal Mail does not deliver real emails, so the link must be accessible without checking an inbox.

In production, the invite link is sent exclusively by email and is not shown in the UI.

### Email Preview URLs in Dev

Wherever the application sends an email (registration verification, password reset, billing notifications, team invites), the Ethereal preview URL is logged to the Next.js console:

```
Email sent (dev mode): https://ethereal.email/message/AbCdEf123456
```

Open this URL in a browser to inspect the email. This replaces real email delivery in development.

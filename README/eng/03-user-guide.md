# ClipMaker User Guide

## Table of Contents

1. [What is ClipMaker](#1-what-is-clipmaker)
2. [Registration and Login](#2-registration-and-login)
3. [Dashboard -- Main Page](#3-dashboard----main-page)
4. [Uploading a Video](#4-uploading-a-video)
5. [Video Processing](#5-video-processing)
6. [Working with Clips](#6-working-with-clips)
7. [Clip Editor](#7-clip-editor)
8. [Downloading Clips](#8-downloading-clips)
9. [Auto-Posting to Platforms](#9-auto-posting-to-platforms)
10. [Analytics](#10-analytics)
11. [Settings](#11-settings)
12. [Subscription Plans and Billing](#12-subscription-plans-and-billing)
13. [Team Collaboration](#13-team-collaboration)
14. [Frequently Asked Questions](#14-frequently-asked-questions)

---

## 1. What is ClipMaker

ClipMaker is an AI-powered SaaS that automatically transforms long webinars and videos into short promotional clips (shorts) with Russian subtitles.

### How It Works

1. **Upload a video** -- file or URL
2. **AI finds the best moments** -- analyzes the transcript and selects 3-10 engaging fragments
3. **Creates shorts** -- vertical video 9:16 with subtitles
4. **Scores virality** -- each clip gets a score from 0 to 100
5. **Auto-publishes** -- to VK Clips, Rutube, Dzen, and Telegram

### Who Is It For

- Online course creators and webinar hosts
- Bloggers and content creators
- SMM agencies
- Anyone producing video content in Russian

---

## 2. Registration and Login

### Email Registration

1. Navigate to `/register`
2. Enter your email and password (minimum 8 characters)
3. Click "Register"
4. Check your inbox -- confirm your email via the link
5. After confirmation, you receive the Free plan automatically

### VK OAuth Login

1. Click "Sign in with VK"
2. Authorize in VK (if not already logged in)
3. Grant permission to the application
4. You are automatically redirected to the dashboard

### Password Recovery

1. On the login page, click "Forgot password?"
2. Enter the email associated with your account
3. Receive a password reset link (valid for 1 hour)
4. Set a new password

---

## 3. Dashboard -- Main Page

After logging in, you arrive at the dashboard (`/dashboard`).

```
[Dashboard main page]
+----------------------------------------------------------+
| ClipMaker   Videos  Upload  Analytics  Team      [gear]  |
+----------------------------------------------------------+
|                                                          |
|  [Total clips]   [Minutes used]    [Billing period]      |
|     42             85/120 min       until Mar 15         |
|                                                          |
|  Recent videos                                           |
|  +----------------------------------------------------+  |
|  | Webinar: Sales in 2026         | Completed | 5 clips|  |
|  | Marketing Masterclass          | Processing| ---    |  |
|  | Finance Lecture                | Completed | 8 clips|  |
|  +----------------------------------------------------+  |
|                                                          |
|  [Upload video]                                          |
+----------------------------------------------------------+
```

### Dashboard Elements

| Element | Description |
|---------|-------------|
| Stats cards | Number of clips, used minutes, billing period end date |
| Video list | Recently uploaded videos with processing status |
| Status badge | uploading, transcribing, analyzing, generating_clips, completed, failed |
| Upload button | Quick access to upload a new video |

### Empty State

If you have no videos, an onboarding prompt is displayed: "Upload your first video" with a drag-and-drop area.

---

## 4. Uploading a Video

Navigate to `/dashboard/upload`.

### File Upload

1. Drag and drop a video file into the upload area or click "Choose file"
2. Supported formats: **MP4, WebM, MOV, AVI**
3. Maximum size: **4 GB**
4. Wait for the upload to complete (a progress bar is displayed)
5. Processing starts automatically

### URL Upload

1. Paste a video URL into the input field
2. Click "Start"
3. The system downloads the video on the server
4. Processing starts automatically

### File Validation

The system checks files not only by extension but also by content (magic bytes):

| Check | Action on Error |
|-------|----------------|
| File format | "Supported formats: MP4, WebM, MOV, AVI" |
| Size > 4 GB | "Maximum file size: 4 GB" |
| Not a video file | "Please upload a video file" |
| Minutes exhausted | Prompt to upgrade to a paid plan |

---

## 5. Video Processing

After upload, the video passes through an automated processing pipeline:

```
Upload --> Transcription --> AI Analysis --> Clip Creation --> Done
 (STT)     (Whisper)       (LLM Router)    (FFmpeg)
```

### Processing Stages

| Stage | Description | Time (60 min video) |
|-------|-------------|---------------------|
| Upload | File is saved to cloud storage | Depends on network speed |
| Transcription | AI recognizes speech and creates text with timestamps | ~60 sec |
| AI Analysis | Neural network finds the best moments and scores them | ~30 sec |
| Clip Creation | FFmpeg cuts the video, adds subtitles | ~60 sec |

**Total time: approximately 2-3 minutes for a 60-minute video.**

### Progress Tracking

Processing progress updates in real time on the video page (`/dashboard/videos/[videoId]`). After completion, the page automatically refreshes to show the finished clips.

---

## 6. Working with Clips

After processing completes, the video page displays a list of clips.

### Clip Card

Each clip card shows:

- **Video preview** with inline playback
- **Title** -- AI-generated engaging title
- **Duration** -- clip length in seconds
- **Virality Score** (0-100) with breakdown
- **Action buttons** -- Download, Edit, Publish
- **Publication status** -- per-platform badges

### Virality Score

Each clip receives a score from 0 to 100, composed of four components:

| Component | Maximum | What It Evaluates |
|-----------|---------|-------------------|
| **Hook** | 25 | How compelling the opening is |
| **Engagement** | 25 | Whether it holds attention throughout |
| **Flow** | 25 | Logical coherence and smoothness |
| **Trend** | 25 | Alignment with current trends |

### Sorting and Filtering

- Clips are sorted by virality score (best first)
- Clips with scores below 30 are hidden by default (can be expanded)
- Number of clips depends on your plan (Free: 3, Start: 10, Pro/Business: up to 100)

### Transcript

Below the clip cards, a collapsible full transcript of the video is available with timestamps.

---

## 7. Clip Editor

Click "Edit" on a clip card to open the editor (`/dashboard/videos/[videoId]/clips/[clipId]/edit`).

### Editor Features

| Feature | Description |
|---------|-------------|
| Trim | Drag start/end handles on the timeline |
| Subtitle editing | Click on a subtitle segment and modify the text |
| Title | Edit the auto-generated title |
| Description | Add a description for publishing |
| Preview | View the clip with all edits applied |

### Output Formats

| Format | Aspect Ratio | Use Case |
|--------|-------------|----------|
| Portrait | 9:16 | VK Clips, YouTube Shorts, TikTok |
| Square | 1:1 | Instagram Feed, VK posts |
| Landscape | 16:9 | YouTube, standard video |

---

## 8. Downloading Clips

### Download a Single Clip

1. On the video page, find the desired clip
2. Click the "Download" button
3. The file downloads as MP4 (H.264, 1080p)

### Download All Clips

1. On the video page, click "Download all"
2. All clips are packaged into a ZIP archive
3. A single ZIP file downloads containing all clips

### Watermark

| Plan | Watermark |
|------|-----------|
| Free | Yes -- "ClipMaker" watermark in the corner |
| Start, Pro, Business | No |

---

## 9. Auto-Posting to Platforms

### 9.1. Connecting Platforms

Go to Settings > Platforms (`/dashboard/settings/platforms`).

**Available platforms by plan:**

| Platform | Free | Start | Pro | Business |
|----------|------|-------|-----|----------|
| VK Clips | -- | Yes | Yes | Yes |
| Rutube | -- | -- | Yes | Yes |
| Dzen | -- | -- | Yes | Yes |
| Telegram | -- | -- | Yes | Yes |

### 9.2. Connecting VK

1. Click "Connect" next to VK
2. Authenticate through VK OAuth
3. Grant permission to publish videos
4. Status changes to "Connected"

### 9.3. Publishing a Clip

1. On the video page, click "Publish" on a clip card
2. Select platforms for publication
3. Click "Publish now"
4. Publication status is displayed on the clip card

### 9.4. Publication Statuses

| Status | Meaning |
|--------|---------|
| Scheduled | Task is in the queue |
| Publishing... | Uploading to the platform |
| Published | Successful, link available |
| Error | Failed (automatically retries up to 3 times) |

### 9.5. Error Handling

If publishing fails:
- The system automatically retries up to 3 times with increasing intervals
- If all attempts fail, status changes to "Error"
- You can retry publishing manually

---

## 10. Analytics

Navigate to the Analytics page (`/dashboard/analytics`).

### Analytics Components

| Component | Description |
|-----------|-------------|
| Overview cards | Total views, likes, shares, clip count |
| Platform table | Metric breakdown by VK, Rutube, Dzen, Telegram |
| Top clips | 10 most-viewed clips |
| Timeline chart | View dynamics over the selected period |
| Date range picker | Filter by date range |

### Statistics Updates

Platform statistics are updated every **6 hours**. If a clip was published less than 6 hours ago, statistics may not yet be available.

---

## 11. Settings

### 11.1. Profile

Page `/dashboard/settings` -- basic profile settings:
- Name and email
- Password change
- Current plan and usage

### 11.2. AI Provider

Page `/dashboard/settings` -- choose the AI processing strategy:

| Strategy | Description |
|----------|-------------|
| **RU (Cloud.ru)** | All data processed in Russia. 152-FZ compliant. Default |
| **Global** | Gemini, Claude, OpenAI. Transcripts sent abroad (with your consent) |

When switching to Global, a warning is displayed about data transfer outside Russia.

### 11.3. API Keys (BYOK)

Page `/dashboard/settings/api-keys` -- manage your own API keys:

**How BYOK works:**
1. You enter an API key in the browser
2. The key is encrypted with AES-GCM 256-bit right in the browser
3. The encrypted key is stored in your browser's IndexedDB
4. During video processing, the key is decrypted and sent to the server
5. The server uses the key for a single request and immediately discards it from memory
6. After 30 minutes of inactivity, keys are automatically locked

### 11.4. Platforms

Page `/dashboard/settings/platforms` -- connect/disconnect platforms for auto-posting (details in section 9).

---

## 12. Subscription Plans and Billing

### 12.1. Plan Comparison

| Feature | Free | Start (990 RUB) | Pro (2,990 RUB) | Business (9,990 RUB) |
|---------|------|-----------------|-----------------|---------------------|
| Minutes/month | 30 | 120 | 1,000 | Unlimited |
| Clips/video | 3 | 10 | 100 | 100 |
| Watermark | Yes | No | No | No |
| Auto-posting | -- | VK | VK, Rutube, Dzen, TG | VK, Rutube, Dzen, TG |
| Team | 1 person | 1 person | 3 people | 10 people |
| AI models | Basic | Basic | Advanced | Advanced |
| Clip storage | 3 days | 30 days | 90 days | 90 days |

Extra minutes: **15 RUB/min** (for Start and above).

### 12.2. Payment

Go to the Billing page (`/dashboard/billing`).

**Payment methods:**

| Method | Description |
|--------|-------------|
| Bank card | Visa, MasterCard, MIR via YooKassa |
| SBP (QR code) | Scan the QR code with your banking app |

### 12.3. Payment Process

1. On the billing page, select a plan
2. Click "Upgrade to [plan]"
3. Choose payment method (card or SBP)
4. For card: enter card details on the secure YooKassa page
5. For SBP: scan the QR code
6. After successful payment, the plan activates immediately

### 12.4. Cancelling a Subscription

1. Go to Billing
2. Click "Cancel subscription"
3. Confirm cancellation
4. The plan remains active until the end of the paid period
5. After the period ends, you revert to the Free plan

---

## 13. Team Collaboration

### 13.1. Creating a Team

Navigate to the Team page (`/dashboard/team`).

1. Click "Create team"
2. Enter the team name
3. You become the team owner

### 13.2. Inviting Members

1. On the team page, click "Invite member"
2. Enter the invitee's email
3. Select a role: Admin or Member
4. The invitee receives an email with a join link

### 13.3. Team Roles

| Role | Capabilities |
|------|-------------|
| **Owner** | All permissions, billing management, team deletion |
| **Admin** | Upload videos, manage clips, invite members |
| **Member** | Upload videos, view clips, download |

### 13.4. Team Limits

| Plan | Maximum Members |
|------|-----------------|
| Free | 1 (no team) |
| Start | 1 (no team) |
| Pro | 3 |
| Business | 10 |

---

## 14. Frequently Asked Questions

### General Questions

**Q: What video formats are supported?**
A: MP4, WebM, MOV, AVI. Maximum file size is 4 GB.

**Q: What is the minimum/maximum video length?**
A: Minimum 2 minutes. Maximum depends on your plan's available minutes.

**Q: How long does processing take?**
A: Approximately 2-3 minutes for a 60-minute video.

**Q: Can I process videos in English?**
A: The current version is optimized for Russian. English support is planned for v2.

### Billing

**Q: What happens when minutes run out?**
A: You cannot upload new videos. You can purchase extra minutes at 15 RUB/min or upgrade to a higher plan.

**Q: Can I get a refund?**
A: Yes, within 14 days of payment. Contact support.

**Q: What happens when I cancel my subscription?**
A: The plan stays active until the end of the paid period. Then you revert to the Free plan.

### Technical Questions

**Q: Where are my videos stored?**
A: On servers in Russia (152-FZ compliant). When using the Global AI strategy, transcripts (text only) may be processed abroad.

**Q: How are my API keys protected?**
A: Keys are encrypted with AES-GCM 256-bit right in your browser. The server never stores keys in plaintext.

**Q: A clip failed to publish -- what should I do?**
A: Check the platform connection in Settings > Platforms. Ensure your plan supports auto-posting. The system automatically retries 3 times on failure.

**Q: A video is stuck in processing -- what should I do?**
A: Processing usually takes 2-3 minutes. If the status does not change for more than 10 minutes, refresh the page. If the problem persists, contact support.

---

## Dev vs Production Environment Differences

If you are running ClipMaker in a local development environment, several features behave differently from the production experience. This section explains what to expect.

### User-Visible Differences

| Feature | Development | Production |
|---------|-------------|------------|
| **Registration** | Email is auto-verified -- no confirmation email required | Real verification email sent; you must click the link to activate your account |
| **Emails** | Captured by Ethereal (fake SMTP) -- preview URLs logged to the console instead of real delivery | Real emails delivered to your inbox |
| **Platform OAuth (VK, Dzen)** | Simulated connections with "(dev)" badge -- no real OAuth redirect | Real OAuth flow with VK and Yandex |
| **Payments** | Non-functional -- upgrade buttons return errors unless YooKassa test credentials are configured | Full payment processing via YooKassa (bank cards, SBP) |
| **Clip URLs** | Served through API proxy (`/api/clips/` routes) since MinIO is not publicly accessible | Served as presigned S3 URLs directly from cloud storage |
| **Dev-Mode Banner** | Blue info banner on the Platforms page explains that OAuth is simulated | No banner -- real connections only |

### What You Will See in Dev Mode

**Registration:**
- After clicking "Register", you are immediately verified without needing to check your email.
- The system skips the email verification step when `NODE_ENV === 'development'`.

**Platform Connections:**
- On the Platforms page (`/dashboard/settings/platforms`), a blue banner at the top explains that OAuth platforms use simulated connections.
- Connected platforms display a "(dev)" badge next to the platform name, indicating the connection is simulated.
- Token-based platforms (Rutube, Telegram) work normally -- you can enter real tokens.

**Emails:**
- When the system sends an email (password reset, team invite, billing notification), it is captured by Ethereal Mail instead of being delivered.
- The Ethereal preview URL is printed to the application console. Open it in a browser to view the email content.

**Team Invites:**
- In development, the invite link is also displayed directly in the UI after sending, so you can use it without checking email.

**Payments:**
- The billing page displays plans and prices normally, but clicking "Upgrade" will fail unless YooKassa test credentials are configured in the `.env` file.

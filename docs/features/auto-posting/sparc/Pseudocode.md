# Pseudocode: Auto-Posting

## Data Structures

```typescript
// Already exists in schema.prisma — included for reference
type PlatformConnection = {
  id: UUID
  userId: UUID
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram'
  accessTokenEncrypted: string
  refreshTokenEncrypted: string | null
  expiresAt: DateTime | null
  metadata: JSON // { accountName, channelId, channelName, etc. }
  createdAt: DateTime
  updatedAt: DateTime
}

type Publication = {
  id: UUID
  clipId: UUID
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram'
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
  scheduledAt: DateTime | null
  publishedAt: DateTime | null
  platformPostId: string | null
  platformUrl: string | null
  views: int
  likes: int
  shares: int
  lastStatsSync: DateTime | null
  errorMessage: string | null
}

// Note: schema.prisma needs migration to add 'cancelled' to PublicationStatus enum
// and add 'errorMessage' field to Publication model if not present.

// Plan-based platform access mapping
const PLAN_PLATFORM_ACCESS: Record<PlanId, Platform[]> = {
  free: [],
  start: ['vk'],
  pro: ['vk', 'rutube', 'dzen', 'telegram'],
  business: ['vk', 'rutube', 'dzen', 'telegram'],
}

// Per-platform file size limits
const PLATFORM_FILE_LIMITS: Record<Platform, number> = {
  vk: 256 * 1024 * 1024,       // 256MB (VK Clips limit)
  rutube: 10 * 1024 * 1024 * 1024, // 10GB
  dzen: 4 * 1024 * 1024 * 1024,    // 4GB
  telegram: 50 * 1024 * 1024,       // 50MB (Bot API limit)
}

// Per-platform upload timeouts
const PLATFORM_TIMEOUTS: Record<Platform, number> = {
  vk: 600_000,       // 10 min
  rutube: 900_000,   // 15 min (resumable)
  dzen: 600_000,     // 10 min
  telegram: 300_000, // 5 min (50MB max anyway)
}

// Abstract base class for platform providers
abstract class PlatformProvider {
  abstract publish(params: PublishParams): Promise<PublishResult>
  abstract getStats(params: StatsParams): Promise<StatsResult | null>
  abstract testConnection(accessToken: string): Promise<{ valid: boolean; accountName: string }>
}

type PublishParams = {
  filePath: string
  title: string
  description: string
  accessToken: string
  metadata?: Record<string, unknown> // platform-specific: channelId for Telegram, etc.
}

type PublishResult = {
  postId: string
  url: string
}

type StatsResult = {
  views: number
  likes: number | null   // null if platform has no likes API (e.g. Rutube)
  shares: number | null   // null if platform has no shares API
}
```

## Algorithm: Platform Connection (OAuth)

### VK OAuth Flow
```
INPUT: userId
OUTPUT: PlatformConnection record

STEPS:
1. Generate state = crypto.randomUUID()
2. Store state in Redis: `oauth:vk:${state}` → userId (TTL 5 min)
3. Redirect to:
   https://oauth.vk.com/authorize?
     client_id=${VK_APP_ID}&
     redirect_uri=${CALLBACK_URL}&
     scope=video,wall,offline&
     response_type=code&
     state=${state}&
     v=5.199

4. ON CALLBACK (/api/oauth/vk/callback):
   a. Validate state from Redis
   b. Exchange code for access_token:
      POST https://oauth.vk.com/access_token
        client_id, client_secret, redirect_uri, code
   c. Encrypt access_token with server key
   d. Get user info: GET /method/users.get?access_token=...
   e. Upsert PlatformConnection:
      { userId, platform: 'vk', accessTokenEncrypted, metadata: { name, vkId } }
   f. Redirect to /dashboard/settings?connected=vk
```

### Rutube Token Flow
```
INPUT: userId, apiToken: string
OUTPUT: PlatformConnection record

STEPS:
1. Validate token: GET https://rutube.ru/api/video/?mine=true
   Headers: { Authorization: "Token ${apiToken}" }
   IF 401 → throw "Недействительный токен"

2. Get channel info from response
3. Encrypt apiToken with server key
4. Upsert PlatformConnection:
   { userId, platform: 'rutube', accessTokenEncrypted, metadata: { channelName } }
```

### Дзен OAuth Flow
```
INPUT: userId
OUTPUT: PlatformConnection record

STEPS:
1. Generate state = crypto.randomUUID()
2. Store state in Redis: `oauth:dzen:${state}` → userId (TTL 5 min)
3. Redirect to Yandex OAuth:
   https://oauth.yandex.ru/authorize?
     client_id=${YANDEX_CLIENT_ID}&
     redirect_uri=${YANDEX_REDIRECT_URI}&
     response_type=code&
     state=${state}&
     scope=zen:write+zen:read
   // zen:write — publish videos, zen:read — read stats and publisher info

4. ON CALLBACK (/api/oauth/dzen/callback):
   a. Validate state from Redis, delete key
   b. Exchange code for tokens:
      POST https://oauth.yandex.ru/token
        body: { grant_type: 'authorization_code', code, client_id, client_secret, redirect_uri }
      Response: { access_token, refresh_token, expires_in, token_type }
   c. Encrypt access_token and refresh_token with PLATFORM_TOKEN_SECRET
   d. Get publisher info:
      GET https://zen.yandex.ru/media-api/v3/publisher/me
        headers: { Authorization: "OAuth ${access_token}" }
      Response: { id, name, ... }
   e. Upsert PlatformConnection:
      { userId, platform: 'dzen', accessTokenEncrypted, refreshTokenEncrypted,
        expiresAt: now() + expires_in, metadata: { publisherId: id, publisherName: name } }
   f. Redirect to /dashboard/settings?connected=dzen
```

### Telegram Bot Flow
```
INPUT: userId, botToken: string, channelId: string
OUTPUT: PlatformConnection record

STEPS:
1. Validate bot: GET https://api.telegram.org/bot${botToken}/getMe
   IF error → throw "Недействительный токен бота"

2. Validate channel access:
   GET /bot${botToken}/getChat?chat_id=${channelId}
   IF error → throw "Бот не является админом канала"

3. Encrypt botToken
4. Upsert PlatformConnection:
   { userId, platform: 'telegram', accessTokenEncrypted,
     metadata: { botName, channelId, channelName } }
```

## Algorithm: Publish Clip

```
INPUT: clipId, platforms[], scheduleAt: Date | null
OUTPUT: Publication[]

STEPS:
1. clip = db.clips.findUnique(clipId)
   IF clip.status !== 'ready': throw "Клип не готов"
   IF !clip.filePath: throw "Файл клипа не найден"

2. user = db.users.findUnique(clip.userId)
   allowedPlatforms = PLAN_PLATFORM_ACCESS[user.planId]

3. // Validate scheduling time (min 5 minutes in future)
   IF scheduleAt:
     IF scheduleAt.getTime() - Date.now() < 5 * 60 * 1000:
       throw "Время публикации должно быть минимум через 5 минут"

4. // Validate file size per platform
   fileSize = fs.statSync(clip.filePath).size
   FOR EACH platform IN platforms:
     IF fileSize > PLATFORM_FILE_LIMITS[platform]:
       throw "Файл слишком большой для ${platform} (максимум ${PLATFORM_FILE_LIMITS[platform] / 1024 / 1024} МБ)"

5. publications = []
   FOR EACH platform IN platforms:
     // Check plan allows platform
     IF platform NOT IN allowedPlatforms:
       throw "Платформа ${platform} недоступна на вашем тарифе"

     // Check connection exists and not expired
     connection = db.platformConnections.findUnique({ userId, platform })
     IF !connection: throw "Подключите ${platform} в настройках"
     IF connection.expiresAt && connection.expiresAt < now():
       throw "Токен для ${platform} истёк, переподключите в настройках"

     // Check no active publication for same clip+platform
     existing = db.publications.findFirst({
       clipId, platform, status: IN ['scheduled', 'publishing']
     })
     IF existing: throw "Публикация уже в процессе"

     // Create publication
     publication = db.publications.create({
       clipId, platform,
       status: scheduleAt ? 'scheduled' : 'publishing',
       scheduledAt: scheduleAt
     })

     // Enqueue job (do NOT pass raw token — worker reads it from DB)
     jobDelay = scheduleAt ? (scheduleAt.getTime() - Date.now()) : 0
     queue.add('publish', {
       publicationId: publication.id,
       clipId: clip.id,
       platform,
       connectionId: connection.id,
       filePath: clip.filePath,
       title: clip.title ?? clip.video.title,
       description: clip.description,
       metadata: connection.metadata // channelId for Telegram, etc.
     }, {
       delay: jobDelay,
       attempts: 3,
       backoff: { type: 'exponential', delay: 300000 }, // 5 min
       jobId: `pub-${publication.id}` // allows removal by ID for cancellation
     })

     publications.push(publication)

6. RETURN publications
```

## Algorithm: Publish Worker

```
WORKER 'publish':
  INPUT: PublishJobData { publicationId, clipId, platform, connectionId, filePath, title, description, metadata }

  STEPS:
  1. publication = db.publications.findUnique(publicationId)
     IF !publication: RETURN (job orphaned)
     IF publication.status === 'published': RETURN (idempotent)
     IF publication.status === 'cancelled': RETURN (cancelled by user)

  2. db.publications.update(publicationId, { status: 'publishing' })

  3. // Read token from DB (NOT from job data — avoids token in Redis)
     connection = db.platformConnections.findUnique(connectionId)
     IF !connection:
       db.publications.update(publicationId, { status: 'failed', errorMessage: 'Подключение удалено' })
       RETURN

  4. accessToken = decrypt(connection.accessTokenEncrypted, PLATFORM_TOKEN_SECRET)

  5. provider = getPlatformProvider(platform)

  6. TRY:
       result = await provider.publish({
         filePath,
         title,
         description,
         accessToken,
         metadata, // channelId for Telegram, etc.
       })

       db.publications.update(publicationId, {
         status: 'published',
         platformPostId: result.postId,
         platformUrl: result.url,
         publishedAt: now()
       })

     CATCH error:
       IF error.status === 401:
         // Token expired — try refresh
         refreshed = await tryRefreshToken(connectionId, platform)
         IF refreshed: RETRY job with refreshed token
         ELSE:
           db.publications.update(publicationId, {
             status: 'failed',
             errorMessage: "Токен истёк, переподключите платформу"
           })
           db.platformConnections.update(connectionId, { expiresAt: now() })
           RETURN

       IF job.attemptsMade < job.opts.attempts:
         THROW error // BullMQ will retry with exponential backoff

       // Final failure (all retries exhausted)
       db.publications.update(publicationId, {
         status: 'failed',
         errorMessage: truncate(error.message, 500)
       })
```

## Algorithm: Token Refresh

```
FUNCTION tryRefreshToken(connectionId, platform):
  connection = db.platformConnections.findUnique(connectionId)
  IF !connection: RETURN false
  IF !connection.refreshTokenEncrypted: RETURN false

  refreshToken = decrypt(connection.refreshTokenEncrypted, PLATFORM_TOKEN_SECRET)

  TRY:
    SWITCH platform:
      CASE 'vk':
        // VK with "offline" scope doesn't need refresh — token is permanent
        // If we get 401, token was revoked by user
        RETURN false

      CASE 'dzen':
        // Yandex OAuth token refresh
        response = POST https://oauth.yandex.ru/token
          body: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: YANDEX_CLIENT_ID,
            client_secret: YANDEX_CLIENT_SECRET
          }
        IF response.error: RETURN false

        newAccessToken = encrypt(response.access_token, PLATFORM_TOKEN_SECRET)
        newRefreshToken = response.refresh_token
          ? encrypt(response.refresh_token, PLATFORM_TOKEN_SECRET)
          : connection.refreshTokenEncrypted
        newExpiresAt = now() + response.expires_in seconds

        db.platformConnections.update(connectionId, {
          accessTokenEncrypted: newAccessToken,
          refreshTokenEncrypted: newRefreshToken,
          expiresAt: newExpiresAt
        })
        RETURN true

      CASE 'rutube':
        // Rutube uses long-lived API tokens, no refresh mechanism
        RETURN false

      CASE 'telegram':
        // Telegram bot tokens don't expire
        RETURN false

  CATCH:
    RETURN false
```

## Algorithm: VK Provider

```
CLASS VKProvider extends PlatformProvider:

  async publish({ filePath, title, description, accessToken }):
    // 0. Validate file size (VK Clips max 256MB)
    fileSize = fs.statSync(filePath).size
    IF fileSize > PLATFORM_FILE_LIMITS.vk:
      throw "Файл слишком большой для VK Клипов (максимум 256 МБ)"

    // 1. Create video upload session
    //    is_short=1 is REQUIRED for VK Clips (short vertical videos)
    response = POST https://api.vk.com/method/video.save
      params: {
        name: title,
        description,
        is_private: 0,
        wallpost: 0,
        is_short: 1,       // ← CRITICAL: makes it a VK Clip, not regular video
        v: '5.199'
      }
      headers: { Authorization: "Bearer ${accessToken}" }

    IF response.error:
      throw PlatformApiError(response.error.error_msg, response.error.error_code)

    uploadUrl = response.response.upload_url
    videoId = response.response.video_id
    ownerId = response.response.owner_id

    // 2. Upload file via streaming (no full file in memory)
    fileStream = fs.createReadStream(filePath)
    formData = new FormData()
    formData.append('video_file', fileStream)
    uploadResponse = POST uploadUrl, body: formData, timeout: PLATFORM_TIMEOUTS.vk

    // 3. Return result (VK processes async on their side)
    RETURN {
      postId: `${ownerId}_${videoId}`,
      url: `https://vk.com/clip${ownerId}_${videoId}`
    }

  async getStats({ platformPostId, accessToken }):
    [ownerId, videoId] = platformPostId.split('_')
    response = POST https://api.vk.com/method/video.get
      params: { videos: platformPostId, v: '5.199' }
      headers: { Authorization: "Bearer ${accessToken}" }

    IF !response.response?.items?.length: RETURN null
    video = response.response.items[0]
    RETURN { views: video.views, likes: video.likes?.count ?? 0, shares: video.reposts?.count ?? 0 }

  async testConnection(accessToken):
    response = POST https://api.vk.com/method/users.get
      params: { v: '5.199' }
      headers: { Authorization: "Bearer ${accessToken}" }
    IF response.error: RETURN { valid: false, accountName: '' }
    user = response.response[0]
    RETURN { valid: true, accountName: `${user.first_name} ${user.last_name}` }
```

## Algorithm: Rutube Provider

```
CLASS RutubeProvider extends PlatformProvider:

  async publish({ filePath, title, description, accessToken }):
    // 0. Validate file size (Rutube max 10GB)
    fileSize = fs.statSync(filePath).size
    IF fileSize > PLATFORM_FILE_LIMITS.rutube:
      throw "Файл слишком большой для Rutube (максимум 10 ГБ)"

    // 1. Create video entry
    response = POST https://rutube.ru/api/video/
      headers: { Authorization: "Token ${accessToken}", Content-Type: "application/json" }
      body: { title, description, is_hidden: false, is_short: true }

    IF response.status !== 200: throw PlatformApiError(response.detail)
    videoId = response.id

    // 2. Upload file (resumable upload)
    uploadUrl = `https://rutube.ru/api/video/${videoId}/upload/`
    fileStream = fs.createReadStream(filePath)
    formData = new FormData()
    formData.append('file', fileStream)
    uploadResponse = PUT uploadUrl, body: formData,
      headers: { Authorization: "Token ${accessToken}" },
      timeout: PLATFORM_TIMEOUTS.rutube

    IF uploadResponse.status !== 200: throw PlatformApiError("Upload failed")

    // 3. Return result (Rutube processes async)
    RETURN {
      postId: videoId,
      url: `https://rutube.ru/video/${videoId}/`
    }

  async getStats({ platformPostId, accessToken }):
    response = GET https://rutube.ru/api/video/${platformPostId}/
      headers: { Authorization: "Token ${accessToken}" }

    IF response.status !== 200: RETURN null
    // Rutube only provides hits (views), no likes/shares API
    RETURN { views: response.hits ?? 0, likes: null, shares: null }

  async testConnection(accessToken):
    response = GET https://rutube.ru/api/video/?mine=true&limit=1
      headers: { Authorization: "Token ${accessToken}" }
    IF response.status === 401: RETURN { valid: false, accountName: '' }
    RETURN { valid: true, accountName: response.author?.name ?? "Rutube" }
```

## Algorithm: Дзен Provider

```
CLASS DzenProvider extends PlatformProvider:

  async publish({ filePath, title, description, accessToken }):
    // 0. Validate file size (Дзен max 4GB)
    fileSize = fs.statSync(filePath).size
    IF fileSize > PLATFORM_FILE_LIMITS.dzen:
      throw "Файл слишком большой для Дзен (максимум 4 ГБ)"

    // 1. Create video draft via Zen Studio API
    response = POST https://zen.yandex.ru/media-api/v3/publisher/videos
      headers: { Authorization: "OAuth ${accessToken}", Content-Type: "application/json" }
      body: { title, description, type: "short" }

    IF response.error: throw PlatformApiError(response.error.message)
    videoId = response.id
    uploadUrl = response.uploadUrl

    // 2. Upload file
    fileStream = fs.createReadStream(filePath)
    uploadResponse = PUT uploadUrl, body: fileStream,
      headers: { Authorization: "OAuth ${accessToken}", Content-Type: "video/mp4" },
      timeout: PLATFORM_TIMEOUTS.dzen

    // 3. Publish (explicit call required after upload)
    publishResponse = POST https://zen.yandex.ru/media-api/v3/publisher/videos/${videoId}/publish
      headers: { Authorization: "OAuth ${accessToken}" }

    IF publishResponse.error: throw PlatformApiError(publishResponse.error.message)

    RETURN {
      postId: videoId,
      url: publishResponse.url ?? `https://dzen.ru/video/watch/${videoId}`
    }

  async getStats({ platformPostId, accessToken }):
    response = GET https://zen.yandex.ru/media-api/v3/publisher/videos/${platformPostId}/stats
      headers: { Authorization: "OAuth ${accessToken}" }

    IF response.error: RETURN null
    RETURN { views: response.views ?? 0, likes: response.likes ?? 0, shares: response.shares ?? 0 }

  async testConnection(accessToken):
    response = GET https://zen.yandex.ru/media-api/v3/publisher/me
      headers: { Authorization: "OAuth ${accessToken}" }
    IF response.error: RETURN { valid: false, accountName: '' }
    RETURN { valid: true, accountName: response.name ?? "Дзен" }
```

## Algorithm: Telegram Provider

```
CLASS TelegramProvider extends PlatformProvider:

  async publish({ filePath, title, description, accessToken, metadata }):
    // accessToken = bot token, metadata.channelId = target channel
    channelId = metadata.channelId
    IF !channelId: throw "channelId отсутствует в метаданных подключения"

    // 0. Validate file size (Telegram Bot API max 50MB)
    fileSize = fs.statSync(filePath).size
    IF fileSize > PLATFORM_FILE_LIMITS.telegram:
      throw "Файл слишком большой для Telegram (максимум 50 МБ)"

    // 1. Upload and send video in one call
    formData = new FormData()
    formData.append('chat_id', channelId)
    formData.append('video', fs.createReadStream(filePath))
    formData.append('caption', `${title}\n\n${description}`.trim().slice(0, 1024))
    formData.append('supports_streaming', 'true')

    response = POST https://api.telegram.org/bot${accessToken}/sendVideo
      body: formData, timeout: PLATFORM_TIMEOUTS.telegram

    IF !response.ok: throw PlatformApiError(response.description)

    messageId = response.result.message_id
    // Telegram channel links: t.me/c/<channel_id>/<message_id> or t.me/<username>/<message_id>
    channelUsername = metadata.channelUsername  // may be null for private channels
    url = channelUsername
      ? `https://t.me/${channelUsername}/${messageId}`
      : `https://t.me/c/${channelId.replace('-100', '')}/${messageId}`

    RETURN {
      postId: String(messageId),
      url
    }

  async getStats({ platformPostId, accessToken }):
    // Telegram Bot API does NOT provide video/post stats (views, likes)
    // Only channel-level member count is available via getChat
    // Return null to indicate stats are unavailable for this platform
    RETURN null

  async testConnection(accessToken):
    response = GET https://api.telegram.org/bot${accessToken}/getMe
    IF !response.ok: RETURN { valid: false, accountName: '' }
    RETURN { valid: true, accountName: response.result.username }
```

## Algorithm: Stats Collection (Cron Enqueuer)

```
CRON 'stats-collect' (every 6 hours):

  STEPS:
  1. publications = db.publications.findMany({
       status: 'published',
       publishedAt: { gte: now() - 30 days },
       // Skip Telegram — no stats API
       platform: { not: 'telegram' },
       OR: [
         { lastStatsSync: null },
         { lastStatsSync: { lte: now() - 6 hours } }
       ]
     })

  2. FOR EACH publication IN batches of 50:
       connection = db.platformConnections.findFirst({
         userId: publication.clip.userId,
         platform: publication.platform
       })
       IF !connection: SKIP

       queue.add('stats-collect', {
         publicationId: publication.id,
         connectionId: connection.id,
         platform: publication.platform,
         platformPostId: publication.platformPostId
       }, {
         attempts: 2,
         backoff: { type: 'fixed', delay: 60000 }
       })
```

## Algorithm: Stats Collection Worker

```
WORKER 'stats-collect':
  INPUT: { publicationId, connectionId, platform, platformPostId }

  STEPS:
  1. connection = db.platformConnections.findUnique(connectionId)
     IF !connection: RETURN

  2. accessToken = decrypt(connection.accessTokenEncrypted, PLATFORM_TOKEN_SECRET)

  3. provider = getPlatformProvider(platform)

  4. stats = await provider.getStats({ platformPostId, accessToken })
     IF stats === null: RETURN // Platform doesn't support stats (e.g. Telegram)

  5. db.publications.update(publicationId, {
       views: stats.views,
       likes: stats.likes ?? 0,   // null → 0 for platforms without likes
       shares: stats.shares ?? 0, // null → 0 for platforms without shares
       lastStatsSync: now()
     })
```

## Algorithm: Disconnect Platform

```
FUNCTION disconnectPlatform(userId, platform):

  STEPS:
  1. connection = db.platformConnections.findUnique({ userId, platform })
     IF !connection: throw "Платформа не подключена"

  2. // Cancel all scheduled/publishing publications for this platform
     pendingPubs = db.publications.findMany({
       clip: { userId },
       platform,
       status: IN ['scheduled', 'publishing']
     })

     FOR EACH pub IN pendingPubs:
       db.publications.update(pub.id, { status: 'cancelled', errorMessage: 'Платформа отключена' })
       // Remove BullMQ job if still in queue (delayed or waiting)
       TRY: queue.remove(`pub-${pub.id}`)
       CATCH: // Job may already be processing, that's OK

  3. // Delete the connection (cascades token removal)
     db.platformConnections.delete(connection.id)

  4. // Optionally revoke token (best-effort, don't fail on error)
     TRY:
       IF platform === 'vk':
         // VK has no explicit token revocation API
       IF platform === 'dzen':
         POST https://oauth.yandex.ru/revoke_token
           body: { access_token: decrypt(connection.accessTokenEncrypted), client_id: YANDEX_CLIENT_ID }
     CATCH: // Ignore — user already disconnected

  5. RETURN { disconnected: true }
```

## Algorithm: Cancel Publication

```
FUNCTION cancelPublication(userId, publicationId):

  STEPS:
  1. publication = db.publications.findUnique(publicationId, include: { clip: true })
     IF !publication: throw "Публикация не найдена"
     IF publication.clip.userId !== userId: throw "Нет доступа"

  2. IF publication.status NOT IN ['scheduled']:
       throw "Можно отменить только запланированные публикации"

  3. db.publications.update(publicationId, { status: 'cancelled' })

  4. // Remove delayed BullMQ job
     TRY: queue.remove(`pub-${publicationId}`)
     CATCH: // Job may have already started

  5. RETURN { cancelled: true }
```

## Algorithm: Retry Publication

```
FUNCTION retryPublication(userId, publicationId):

  STEPS:
  1. publication = db.publications.findUnique(publicationId, include: { clip: true })
     IF !publication: throw "Публикация не найдена"
     IF publication.clip.userId !== userId: throw "Нет доступа"

  2. IF publication.status !== 'failed':
       throw "Можно повторить только неудавшиеся публикации"

  3. // Check connection still exists
     connection = db.platformConnections.findUnique({
       userId, platform: publication.platform
     })
     IF !connection: throw "Подключите ${publication.platform} в настройках"

  4. db.publications.update(publicationId, { status: 'publishing', errorMessage: null })

  5. queue.add('publish', {
       publicationId: publication.id,
       clipId: publication.clipId,
       platform: publication.platform,
       connectionId: connection.id,
       filePath: publication.clip.filePath,
       title: publication.clip.title ?? publication.clip.video.title,
       description: publication.clip.description,
       metadata: connection.metadata
     }, {
       attempts: 3,
       backoff: { type: 'exponential', delay: 300000 },
       jobId: `pub-${publicationId}`
     })

  6. RETURN { retried: true }
```

## Algorithm: Test Connection

```
FUNCTION testConnection(userId, platform):

  STEPS:
  1. connection = db.platformConnections.findUnique({ userId, platform })
     IF !connection: throw "Платформа не подключена"

  2. accessToken = decrypt(connection.accessTokenEncrypted, PLATFORM_TOKEN_SECRET)

  3. provider = getPlatformProvider(platform)
     result = await provider.testConnection(accessToken)

  4. IF !result.valid:
       // Mark connection as expired
       db.platformConnections.update(connection.id, { expiresAt: now() })
       RETURN { valid: false, message: "Токен недействителен, переподключите платформу" }

  5. RETURN { valid: true, accountName: result.accountName }
```

## API Contracts

### POST /trpc/platform.connect
```typescript
Input: {
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram'
  // For token-based (rutube, telegram):
  token?: string
  channelId?: string // telegram only
}
Output:
  // For OAuth (vk, dzen): { redirectUrl: string }
  // For token (rutube, telegram): { connected: true, accountName: string }
```

### GET /api/oauth/vk/callback
```
Query: { code: string, state: string }
Redirect: /dashboard/settings?connected=vk
```

### POST /trpc/platform.disconnect
```typescript
Input: { platform: 'vk' | 'rutube' | 'dzen' | 'telegram' }
Output: { disconnected: true }
```

### GET /trpc/platform.list
```typescript
Output: {
  connections: Array<{
    platform: string
    accountName: string
    connectedAt: Date
    expiresAt: Date | null
  }>
}
```

### POST /trpc/clip.publish (existing, needs modification)
```typescript
Input: {
  id: string (clipId)
  platforms: ('vk' | 'rutube' | 'dzen' | 'telegram')[]
  scheduleAt?: string (ISO datetime, must be ≥5 min in future)
}
Output: {
  publications: Array<{ id, platform, status }>
}
```

### POST /trpc/clip.cancelPublication
```typescript
Input: {
  publicationId: string
}
Output: {
  cancelled: true
}
// Only works for status='scheduled'. Returns error for other statuses.
```

### POST /trpc/clip.retryPublication
```typescript
Input: {
  publicationId: string
}
Output: {
  retried: true
}
// Only works for status='failed'. Re-enqueues the publish job.
```

### POST /trpc/platform.testConnection
```typescript
Input: {
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram'
}
Output: {
  valid: boolean
  accountName?: string
  message?: string  // Error message if invalid
}
```

### GET /api/oauth/dzen/callback
```
Query: { code: string, state: string }
Redirect: /dashboard/settings?connected=dzen
```

## State Transitions

```
Publication Status:
  [created] → scheduled (if scheduleAt provided)
  [created] → publishing (if immediate)
  scheduled → publishing (when scheduleAt reached, worker picks up job)
  scheduled → cancelled (user cancels via clip.cancelPublication)
  scheduled → cancelled (platform disconnected via platform.disconnect)
  publishing → published (platform API success)
  publishing → failed (after 3 retries exhausted)
  publishing → cancelled (platform disconnected during publish — next attempt sees cancelled)
  failed → publishing (manual retry via clip.retryPublication)

Terminal states: published, cancelled
Retriable states: failed → publishing
```

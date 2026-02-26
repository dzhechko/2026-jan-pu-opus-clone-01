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
  status: 'scheduled' | 'publishing' | 'published' | 'failed'
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
1. Generate state, store in Redis
2. Redirect to Yandex OAuth:
   https://oauth.yandex.ru/authorize?
     client_id=${YANDEX_APP_ID}&
     redirect_uri=${CALLBACK_URL}&
     response_type=code&
     state=${state}&
     scope=zen:write

3. ON CALLBACK:
   a. Validate state
   b. Exchange code for token via POST https://oauth.yandex.ru/token
   c. Encrypt tokens
   d. Get publisher info
   e. Upsert PlatformConnection
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
   allowedPlatforms = PLANS[user.planId].autoPostPlatforms

3. publications = []
   FOR EACH platform IN platforms:
     // Check plan allows platform
     IF platform NOT IN allowedPlatforms:
       throw "Платформа ${platform} недоступна на вашем тарифе"

     // Check connection exists
     connection = db.platformConnections.findUnique({ userId, platform })
     IF !connection: throw "Подключите ${platform} в настройках"

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

     // Enqueue job
     jobDelay = scheduleAt ? (scheduleAt.getTime() - Date.now()) : 0
     queue.add('publish', {
       publicationId: publication.id,
       clipId: clip.id,
       platform,
       accessTokenEncrypted: connection.accessTokenEncrypted,
       filePath: clip.filePath,
       title: clip.title ?? clip.video.title,
       description: clip.description
     }, {
       delay: jobDelay,
       attempts: 3,
       backoff: { type: 'exponential', delay: 300000 } // 5 min
     })

     publications.push(publication)

4. RETURN publications
```

## Algorithm: Publish Worker

```
WORKER 'publish':
  INPUT: PublishJobData { publicationId, clipId, platform, accessTokenEncrypted, filePath, title, description }

  STEPS:
  1. publication = db.publications.findUnique(publicationId)
     IF !publication || publication.status === 'published': RETURN (idempotent)

  2. db.publications.update(publicationId, { status: 'publishing' })

  3. accessToken = decrypt(accessTokenEncrypted, SERVER_ENCRYPTION_KEY)

  4. provider = getPlatformProvider(platform)

  5. TRY:
       result = await provider.publish({
         filePath,
         title,
         description,
         accessToken,
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
         refreshed = await tryRefreshToken(publication.clip.userId, platform)
         IF refreshed: RETRY job
         ELSE: FAIL with "Токен истёк, переподключите платформу"

       IF job.attemptsMade < job.opts.attempts:
         THROW error // BullMQ will retry

       // Final failure
       db.publications.update(publicationId, {
         status: 'failed',
         errorMessage: error.message
       })
```

## Algorithm: VK Provider

```
CLASS VKProvider extends PlatformProvider:

  async publish({ filePath, title, description, accessToken }):
    // 1. Create video upload session
    response = POST https://api.vk.com/method/video.save
      params: { name: title, description, is_private: 0, wallpost: 0, v: '5.199' }
      headers: { Authorization: "Bearer ${accessToken}" }

    uploadUrl = response.response.upload_url
    videoId = response.response.video_id
    ownerId = response.response.owner_id

    // 2. Upload file
    fileStream = fs.createReadStream(filePath)
    formData = new FormData()
    formData.append('video_file', fileStream)
    uploadResponse = POST uploadUrl, body: formData

    // 3. Return result (VK processes async)
    RETURN {
      postId: `${ownerId}_${videoId}`,
      url: `https://vk.com/clip${ownerId}_${videoId}`
    }

  async getStats({ platformPostId, accessToken }):
    [ownerId, videoId] = platformPostId.split('_')
    response = POST https://api.vk.com/method/video.get
      params: { videos: platformPostId, v: '5.199' }
      headers: { Authorization: "Bearer ${accessToken}" }

    video = response.response.items[0]
    RETURN { views: video.views, likes: video.likes.count, shares: video.reposts.count }
```

## Algorithm: Stats Collection

```
CRON 'stats-collect' (every 6 hours):

  STEPS:
  1. publications = db.publications.findMany({
       status: 'published',
       publishedAt: { gte: now() - 30 days },
       OR: [
         { lastStatsSync: null },
         { lastStatsSync: { lte: now() - 6 hours } }
       ]
     })

  2. FOR EACH publication:
       connection = db.platformConnections.findFirst({
         userId: publication.clip.userId,
         platform: publication.platform
       })
       IF !connection: SKIP

       queue.add('stats-collect', {
         publicationId: publication.id,
         platform: publication.platform,
         platformPostId: publication.platformPostId
       })
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
  scheduleAt?: string (ISO datetime)
}
Output: {
  publications: Array<{ id, platform, status }>
}
```

## State Transitions

```
Publication Status:
  [created] → scheduled (if scheduleAt provided)
  [created] → publishing (if immediate)
  scheduled → publishing (when scheduleAt reached)
  scheduled → cancelled (if user cancels)
  publishing → published (API success)
  publishing → failed (after 3 retries)
  failed → publishing (manual retry)
```

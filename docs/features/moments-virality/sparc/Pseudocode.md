# Pseudocode: Moments + Virality

## Data Structures

```typescript
type ViralityScore = {
  total: number;       // 0-100
  hook: number;        // 0-25
  engagement: number;  // 0-25
  flow: number;        // 0-25
  trend: number;       // 0-25
  tips: string[];      // 1-3 improvement tips in Russian
};

type MomentCandidate = {
  start: number;       // seconds in source video
  end: number;
  title: string;       // initial title from moment selection
  reason: string;      // why this moment is viral-worthy
  hookStrength: number; // 0-25 preliminary estimate
};

type ClipData = {
  videoId: string;
  userId: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralityScore: ViralityScore;
  subtitleSegments: SubtitleSegment[];
  cta: CtaData | null;
  format: 'portrait';  // 9:16
  status: 'pending';
};

type SubtitleSegment = {
  start: number;    // relative to clip start
  end: number;
  text: string;
};

type CtaData = {
  text: string;
  position: 'end' | 'overlay';
  duration: number; // 3-5 seconds
};
```

## Zod Schemas for LLM Response Validation

```typescript
const MomentResponseSchema = z.object({
  moments: z.array(z.object({
    start: z.number().min(0),
    end: z.number().min(0),
    title: z.string().min(1).max(100),
    reason: z.string().min(1).max(500),
    hook_strength: z.number().min(0).max(25),
  })).min(1).max(15),
});

const ViralityResponseSchema = z.object({
  hook: z.number().min(0).max(25),
  engagement: z.number().min(0).max(25),
  flow: z.number().min(0).max(25),
  trend: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
  tips: z.array(z.string()).min(1).max(3),
});

const TitleResponseSchema = z.object({
  title: z.string().min(1).max(60),
  alternatives: z.array(z.string().max(60)).max(3),
});

const CtaResponseSchema = z.object({
  text: z.string().min(1).max(50),
  position: z.enum(['end', 'overlay']),
  duration: z.number().min(3).max(5),
});
```

## Algorithm: LLM Analyze Worker

```
WORKER: llm-analyze
QUEUE: QUEUE_NAMES.LLM
CONCURRENCY: 2

HANDLER(job):
  task = job.data.task
  SWITCH task:
    CASE 'moment_selection': RETURN handleMomentSelection(job.data)
    CASE 'virality_scoring': ERROR — virality scoring runs inside moment_selection
    CASE 'title_generation': ERROR — title generation runs inside moment_selection
    CASE 'cta_suggestion': ERROR — CTA runs inside moment_selection
    DEFAULT: THROW "Unknown task"
```

## Algorithm: handleMomentSelection

```
INPUT: LLMJobData { videoId, strategy, input: { fullText, tokenCount, planId, videoDurationSeconds } }
OUTPUT: void (side effect: Clip records created in DB)

STEPS:

1. VALIDATE
   video = await prisma.video.findUnique({ where: { id: videoId } })
   IF !video OR video.status !== 'analyzing': THROW "Invalid video state"
   user = await prisma.user.findUnique({ where: { id: video.userId } })
   IF !user: THROW "User not found"
   transcript = await prisma.transcript.findUnique({ where: { videoId } })
   IF !transcript: THROW "Transcript not found"

2. SELECT MOMENTS
   router = new LLMRouter()
   context = { task: 'moment_selection', strategy, tokenCount, planId }

   response = await router.complete(context, [
     { role: 'system', content: MOMENT_SELECTION_PROMPT },
     { role: 'user', content: buildMomentSelectionInput(transcript.fullText, videoDurationSeconds) },
   ], { jsonMode: true, temperature: 0.7 })

   parsed = MomentResponseSchema.safeParse(JSON.parse(response.content))
   IF !parsed.success:
     logger.warn({ event: 'moment_parse_failed', error: parsed.error })
     THROW "Failed to parse moment selection response"

   moments = parsed.data.moments
   totalLlmCostKopecks = response.costKopecks

3. HANDLE EMPTY RESULTS
   IF moments.length === 0:
     // Retry with tier+1
     retryContext = { ...context, previousScore: 0 }
     retryResponse = await router.complete(retryContext, [...same messages...], { jsonMode: true })
     retryParsed = MomentResponseSchema.safeParse(JSON.parse(retryResponse.content))
     totalLlmCostKopecks += retryResponse.costKopecks

     IF retryParsed.success AND retryParsed.data.moments.length > 0:
       moments = retryParsed.data.moments
     ELSE:
       // Fallback: create evenly-spaced clips
       moments = generateFallbackMoments(videoDurationSeconds, 3)

4. VALIDATE MOMENTS
   // Clamp timestamps to video duration
   FOR each moment IN moments:
     moment.start = Math.max(0, moment.start)
     moment.end = Math.min(videoDurationSeconds, moment.end)
     IF moment.end - moment.start < 15: moment.end = moment.start + 15
     IF moment.end - moment.start > 60: moment.end = moment.start + 60
     IF moment.end > videoDurationSeconds:
       moment.end = videoDurationSeconds
       moment.start = Math.max(0, moment.end - 30)

5. SCORE, TITLE, CTA IN PARALLEL
   segments = transcript.segments as TranscriptSegment[]

   enrichedMoments = await pMap(moments, async (moment) => {
     // Extract subtitle segments for this moment
     clipSegments = segments
       .filter(s => s.start >= moment.start && s.end <= moment.end)
       .map(s => ({ start: s.start - moment.start, end: s.end - moment.start, text: s.text }))

     momentText = clipSegments.map(s => s.text).join(' ')

     // Run scoring + title + CTA in parallel
     [scoreResult, titleResult, ctaResult] = await Promise.all([
       scoreVirality(router, strategy, momentText, moment, planId),
       generateTitle(router, strategy, momentText, moment),
       generateCta(router, strategy, momentText),
     ])

     totalLlmCostKopecks += scoreResult.costKopecks + titleResult.costKopecks + ctaResult.costKopecks

     RETURN {
       moment,
       viralityScore: scoreResult.score,
       title: titleResult.title,
       cta: ctaResult.cta,
       subtitleSegments: clipSegments,
     }
   }, { concurrency: 3 })

6. APPLY PLAN LIMITS
   // Sort by score descending
   enrichedMoments.sort((a, b) => b.viralityScore.total - a.viralityScore.total)

   maxClips = getMaxClipsForPlan(user.planId)  // free=3, start=10, pro/business=Infinity
   clipsToCreate = enrichedMoments.slice(0, maxClips)

7. CREATE CLIPS + UPDATE VIDEO (transaction)
   await prisma.$transaction([
     ...clipsToCreate.map(item =>
       prisma.clip.create({
         data: {
           videoId: video.id,
           userId: user.id,
           title: item.title,
           startTime: item.moment.start,
           endTime: item.moment.end,
           duration: item.moment.end - item.moment.start,
           viralityScore: item.viralityScore as Prisma.JsonObject,
           subtitleSegments: item.subtitleSegments as Prisma.JsonArray,
           cta: item.cta as Prisma.JsonObject | Prisma.DbNull,
           format: 'portrait',
           status: 'pending',
         },
       })
     ),
     prisma.video.update({
       where: { id: video.id },
       data: { status: 'generating_clips' },
     }),
     prisma.usageRecord.update({
       where: { videoId_userId: { videoId: video.id, userId: user.id } },
       data: { llmCostKopecks: totalLlmCostKopecks },
     }),
   ])

8. ENQUEUE RENDER JOBS
   renderQueue = createQueue(QUEUE_NAMES.VIDEO_RENDER)
   FOR each clip IN createdClips:
     await renderQueue.add('render', {
       clipId: clip.id,
       videoId: video.id,
       inputPath: video.filePath,
       startTime: clip.startTime,
       endTime: clip.endTime,
       format: clip.format,
     }, DEFAULT_JOB_OPTIONS)

   logger.info({ event: 'llm_analyze_complete', videoId, clips: clipsToCreate.length, costKopecks: totalLlmCostKopecks })
```

## Helper: scoreVirality

```
INPUT: router: LLMRouter, strategy: string, momentText: string, moment: MomentCandidate, planId: string
OUTPUT: { score: ViralityScore, costKopecks: number }

STEPS:
1. context = { task: 'virality_scoring', strategy, planId }
2. response = await router.complete(context, [
     { role: 'system', content: VIRALITY_SCORING_PROMPT },
     { role: 'user', content: momentText },
   ], { jsonMode: true, temperature: 0.3 })
3. parsed = ViralityResponseSchema.safeParse(JSON.parse(response.content))
4. IF !parsed.success:
     // Fallback: derive score from moment's hookStrength
     RETURN { score: { total: moment.hookStrength * 4, hook: moment.hookStrength, engagement: moment.hookStrength, flow: moment.hookStrength, trend: moment.hookStrength, tips: [] }, costKopecks: response.costKopecks }
5. // Validate total = sum of parts
   score = parsed.data
   score.total = score.hook + score.engagement + score.flow + score.trend
6. RETURN { score, costKopecks: response.costKopecks }
```

## Helper: generateTitle

```
INPUT: router: LLMRouter, strategy: string, momentText: string, moment: MomentCandidate
OUTPUT: { title: string, costKopecks: number }

STEPS:
1. context = { task: 'title_generation', strategy }
2. response = await router.complete(context, [
     { role: 'system', content: TITLE_GENERATION_PROMPT },
     { role: 'user', content: momentText },
   ], { jsonMode: true, temperature: 0.8 })
3. parsed = TitleResponseSchema.safeParse(JSON.parse(response.content))
4. IF !parsed.success: RETURN { title: moment.title, costKopecks: response.costKopecks }
5. RETURN { title: parsed.data.title, costKopecks: response.costKopecks }
```

## Helper: generateCta

```
INPUT: router: LLMRouter, strategy: string, momentText: string
OUTPUT: { cta: CtaData | null, costKopecks: number }

STEPS:
1. context = { task: 'cta_suggestion', strategy }
2. response = await router.complete(context, [
     { role: 'system', content: CTA_SUGGESTION_PROMPT },
     { role: 'user', content: momentText },
   ], { jsonMode: true, temperature: 0.6 })
3. parsed = CtaResponseSchema.safeParse(JSON.parse(response.content))
4. IF !parsed.success: RETURN { cta: null, costKopecks: response.costKopecks }
5. RETURN { cta: parsed.data, costKopecks: response.costKopecks }
```

## Helper: generateFallbackMoments

```
INPUT: videoDurationSeconds: number, count: number
OUTPUT: MomentCandidate[]

STEPS:
1. clipDuration = 30  // 30-second clips
2. spacing = (videoDurationSeconds - clipDuration) / (count + 1)
3. moments = []
4. FOR i = 1 TO count:
     start = Math.floor(spacing * i)
     end = start + clipDuration
     moments.push({ start, end, title: `Момент ${i}`, reason: 'Auto-generated fallback', hookStrength: 10 })
5. RETURN moments
```

## Helper: getMaxClipsForPlan

```
INPUT: planId: string
OUTPUT: number

MAP:
  'free' → 3
  'start' → 10
  'pro' → Infinity
  'business' → Infinity
  DEFAULT → 3
```

## Helper: buildMomentSelectionInput

```
INPUT: fullText: string, videoDurationSeconds: number
OUTPUT: string

RETURN:
  "Video duration: {videoDurationSeconds} seconds ({Math.round(videoDurationSeconds/60)} minutes)\n\n" +
  "Transcript:\n" + fullText
```

## STT Worker Integration (modification to stt.ts)

```
AFTER step 9 (save transcript transaction):

// 10. Enqueue LLM analysis
llmQueue = createQueue(QUEUE_NAMES.LLM)
await llmQueue.add('llm:moment_selection', {
  videoId: video.id,
  task: 'moment_selection',
  strategy,
  input: {
    fullText,
    tokenCount,
    planId: user.planId,
    videoDurationSeconds: Math.round(durationSeconds),
  },
}, DEFAULT_JOB_OPTIONS)
```

## tRPC Procedures

### clip.getByVideo

```
INPUT: { videoId: string (uuid) }
OUTPUT: { clips: Clip[], videoStatus: string }

STEPS:
1. userId = ctx.session.user.id
2. video = await prisma.video.findFirst({ where: { id: videoId, userId } })
3. IF !video: THROW NOT_FOUND
4. clips = await prisma.clip.findMany({
     where: { videoId },
     orderBy: { viralityScore: { path: ['total'], sort: 'desc' } },
   })
   NOTE: Prisma doesn't support JSON path ordering directly.
   Use: orderBy: { createdAt: 'asc' } and sort client-side by viralityScore.total
5. RETURN { clips, videoStatus: video.status }
```

## State Transitions

```
Video.status flow for moments-virality:
  "analyzing" → (LLM worker: moment_selection) → "generating_clips"
                                                 ↘ (on error) → "failed"

  "generating_clips" → (video-render worker) → "completed"
                                              ↘ (on error) → keep "generating_clips" (partial clips OK)

Clip.status flow:
  "pending" → (video-render worker) → "rendering" → "ready"
                                                    ↘ → "failed"
```

## Prompt Templates

Defined in `apps/worker/lib/prompts/`:
- `moment-selection.ts` — System prompt for finding viral moments
- `virality-scoring.ts` — System prompt for 4-dimension scoring
- `title-generation.ts` — System prompt for Russian title generation
- `cta-suggestion.ts` — System prompt for CTA creation

Each exports a `SYSTEM_PROMPT` constant and a `buildUserMessage(input)` helper function.

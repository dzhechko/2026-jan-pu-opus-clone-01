# INS-010: STT fails — ffprobe not installed in Codespace

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `spawn ffprobe ENOENT`
- `stt_error`
- Video status stuck at `failed` after successful upload
- `Ошибка транскрибирования` on video detail page

## Root Cause
The STT worker uses `ffprobe` to detect video duration before sending audio to the STT API. GitHub Codespace base images do not include ffmpeg/ffprobe by default.

The worker calls `ffprobe` as a subprocess → Node.js `spawn()` throws `ENOENT` because the binary doesn't exist → STT job fails → video marked as `failed`.

## Solution
Install ffmpeg (includes ffprobe):

```bash
# Skip broken yarn repo if needed
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends ffmpeg
```

Verify:
```bash
ffprobe -version
ffmpeg -version
```

To re-process a failed video:
```sql
UPDATE videos SET status = 'transcribing' WHERE id = '<video-id>';
```
Then re-enqueue the STT job:
```javascript
const { Queue } = require('bullmq');
const q = new Queue('stt', { connection: { host: 'localhost', port: 6379 } });
q.add('stt', { videoId: '<id>', filePath: '<path>', strategy: 'ru', language: 'ru' });
```

## Prevention
Add ffmpeg to Codespace devcontainer config (`.devcontainer/devcontainer.json`):
```json
{
  "features": {
    "ghcr.io/devcontainers-extra/features/ffmpeg:1": {}
  }
}
```

## Files Changed
- None (runtime dependency, not code change)

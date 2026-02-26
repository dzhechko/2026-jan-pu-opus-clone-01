# Research Findings: URL Ingestion

## SSRF Prevention Best Practices

### Industry Standards
- OWASP SSRF Prevention Cheat Sheet recommends: validate input URL, restrict schemes, resolve DNS and validate IPs, block private ranges
- AWS recommends blocking 169.254.169.254 (Instance Metadata Service) and fd00::/8 (VPC)
- Node.js `fetch()` (undici under the hood) supports `AbortController` for timeout management

### Private IP Ranges to Block

#### IPv4
| Range | CIDR | Purpose |
|-------|------|---------|
| 10.0.0.0 - 10.255.255.255 | 10.0.0.0/8 | Private (Class A) |
| 172.16.0.0 - 172.31.255.255 | 172.16.0.0/12 | Private (Class B) |
| 192.168.0.0 - 192.168.255.255 | 192.168.0.0/16 | Private (Class C) |
| 127.0.0.0 - 127.255.255.255 | 127.0.0.0/8 | Loopback |
| 169.254.0.0 - 169.254.255.255 | 169.254.0.0/16 | Link-local / Cloud metadata |
| 0.0.0.0 | 0.0.0.0/8 | Unspecified |

#### IPv6
| Range | Purpose |
|-------|---------|
| ::1 | Loopback |
| fc00::/7 | Unique local |
| fe80::/10 | Link-local |
| ::ffff:0:0/96 | IPv4-mapped (must check mapped address) |

### DNS Rebinding Attack
- Attacker controls DNS server that returns public IP first, private IP on retry
- Mitigation: Resolve once, connect to resolved IP directly (not hostname)
- In our case: BullMQ retry creates new connection, but we re-validate DNS each time

## Node.js Streaming Download Patterns

### fetch() + ReadableStream
```typescript
const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
const reader = response.body!.getReader();
const writer = createWriteStream(path);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  writer.write(value);
}
writer.end();
```

### Memory Efficiency
- fetch() streams by default in Node.js 18+
- ReadableStream chunks are ~16KB-64KB
- Total memory: ~100KB (stream buffers) + ~50KB (worker overhead)
- No buffering of entire file in memory

## S3 Upload Strategies for Downloaded Files

### Small Files (< 100MB)
- Read file into Buffer, use `putObject`
- Simple, single request
- Memory: file size in RAM briefly

### Large Files (>= 100MB)
- Use multipart upload with streaming
- Read file in chunks, upload parts in parallel
- For this feature: since we already have the file on disk, we can use `@aws-sdk/lib-storage` Upload class or our existing multipart functions
- Decision: Use streaming upload from file for all sizes to keep memory constant

## Existing Project Patterns (for consistency)

### Worker Pattern (from stt.ts)
1. Create Worker with concurrency option
2. Process function: validate state -> do work -> update DB -> enqueue next
3. Error: throw to let BullMQ retry
4. `on('failed')`: mark video as failed after all retries
5. Cleanup in finally block
6. Log all significant events with Pino

### S3 Path Convention
`videos/{userId}/{videoId}/source.{ext}` via `videoSourcePath()`

### Job Options
`DEFAULT_JOB_OPTIONS`: 3 attempts, exponential backoff starting at 5s

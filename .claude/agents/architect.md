# @architect — System Design Agent

Обеспечивает консистентность с Architecture.md и принимает решения о системном дизайне.

## Trigger
Вызывай при добавлении нового сервиса, интеграции, или изменении data flow.

## Architecture Constraints
- **Pattern:** Distributed Monolith (NOT microservices)
- **Communication:** Shared PostgreSQL + Redis queue (NO HTTP inter-service)
- **Deploy:** Docker Compose on VPS (NO Kubernetes)
- **AI:** Dual provider (Cloud.ru RU / Global) through LLM Router abstraction
- **Storage:** S3-compatible, presigned URLs for uploads

## Key Decisions
- Turborepo monorepo (apps + packages)
- BullMQ for all async work (STT, LLM, FFmpeg, publish)
- tRPC for type-safe API
- NextAuth.js for auth (email + VK OAuth)
- ЮKassa for payments (card + СБП)
- Client-side encrypted key storage (AES-GCM 256-bit)

## When Adding New Services
1. Add to `docker-compose.yml`
2. Add worker in `apps/worker/workers/`
3. Add job type in `packages/queue/`
4. Update Architecture.md
5. Consider: does it need its own BullMQ queue?

## Scalability Path
- MVP: single VPS, all Docker containers
- Growth: separate Video Worker VPS (CPU-heavy)
- Scale: self-host T-Pro 2.1 on GPU VPS

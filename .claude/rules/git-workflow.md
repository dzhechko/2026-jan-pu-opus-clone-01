# Git Workflow

## Commit Rules
- Commit after each logical change (not at end of session)
- Format: `type(scope): description`
- Max 50 chars for subject line
- Types: feat, fix, refactor, docs, test, chore

## Examples
- `feat(upload): add video upload with S3 presigned URLs`
- `feat(llm-router): implement dual provider strategy`
- `fix(publish): retry VK API on 429 rate limit`
- `test(billing): add ЮKassa webhook idempotency test`

## Branch Strategy
- `main` ← production (auto-deploy)
- `develop` ← staging
- `feat/xxx`, `fix/xxx` ← feature/bugfix branches
- Squash merge, delete branch after merge
- Tag releases: `vYYYYMMDD.HHMM`

# Deploying to Render

This repo ships a `render.yaml` blueprint that provisions everything automatically:
- **API** service (Fastify + in-process BullMQ worker, Dockerfile at `apps/api/Dockerfile`)
- **Web** service (Next.js standalone, Dockerfile at `apps/web/Dockerfile`)
- **Managed PostgreSQL** (`doc-to-audio-db`)
- **Managed Redis** (`doc-to-audio-redis`)
- **Persistent disk** (10 GB, mounted at `/data/uploads` — keeps PDFs and MP3s across restarts)

---

## First-time setup

### 1. Connect the repo
1. Sign in to [render.com](https://render.com) and click **New → Blueprint**.
2. Connect your GitHub/GitLab repo and point it at this directory.
3. Render reads `render.yaml` and creates all four resources.

### 2. Set the required secrets

Several env vars are marked `sync: false` — they are **not** in the YAML and must be set in the Render dashboard before the first deploy.

| Service | Variable | Value |
|---------|----------|-------|
| API | `GEMINI_API_KEY` | Your Google AI Studio key |
| API | `CORS_ORIGIN` | Your web service's public URL (e.g. `https://doc-to-audio-web.onrender.com`) |
| Web | `NEXT_PUBLIC_API_URL` | Your API service's public URL (e.g. `https://doc-to-audio-api.onrender.com`) |
| Web | `API_INTERNAL_URL` | Same as `NEXT_PUBLIC_API_URL` on Render (services are not on the same private network unless using a private service) |

> **Optional – Gemini quota rotation:** Set `GEMINI_API_KEYS` on the API service to a comma-separated list of Gemini keys to spread load across multiple daily quotas.

> **Optional – Azure TTS fallback:** Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` on the API service. When configured, users can select Azure as the TTS provider in the UI.

### 3. Deploy

Trigger a deploy for both services. On first boot the API runs `prisma db push` automatically (via `docker-entrypoint.sh`) to sync the database schema.

---

## Notes

### `NEXT_PUBLIC_API_URL` is baked in at build time

Next.js embeds `NEXT_PUBLIC_*` variables at build time, not runtime. If you ever change the API service's URL you must trigger a **manual redeploy** of the web service (not just a restart) so the new URL is compiled in.

### Persistent disk — single instance only

The persistent disk at `/data/uploads` is mounted on one instance. Render's free tier runs one instance per service by default, so this works fine. If you later enable autoscaling to multiple API instances, uploaded files would only exist on the instance that received the upload request — at that point, migrate to an object store (Cloudflare R2, AWS S3) and update `UPLOAD_DIR` to point to a local temp path, serving files directly from the store.

### Health check

The API exposes `GET /health` → `{ status: "ok", uptime: <seconds> }`. Render uses this path to determine when the service is ready and to detect crashes.

### Database schema

The API runs `prisma db push` on every container start. This is safe for production as long as migrations are additive (no column drops). If you add a destructive migration, run it manually with `prisma migrate deploy` from a one-off job before deploying.

---

## Local Docker workflow (same images as Render)

```bash
# Build and start everything with Docker Compose
docker compose up --build

# API → http://localhost:4000
# Web → http://localhost:3000
```

Required: create `apps/api/.env` with at minimum:
```
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/doc_to_audio?schema=public
REDIS_URL=redis://redis:6379
JWT_SECRET=<a long random string>
GEMINI_API_KEY=<your key>
CORS_ORIGIN=http://localhost:3000
```

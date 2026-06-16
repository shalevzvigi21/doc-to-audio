# ---- Base ----
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# System binaries the pipeline shells out to:
#   - openssl/ca-certificates : Prisma engines + TLS
#   - tesseract-ocr (+heb,+eng): OCR
#   - ghostscript, graphicsmagick: pdf2pic page rasterisation
#   - ffmpeg: ffprobe duration probing
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      tesseract-ocr \
      tesseract-ocr-heb \
      tesseract-ocr-eng \
      ghostscript \
      graphicsmagick \
      ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY packages/types/package.json ./packages/types/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile=false

# ---- Build ----
FROM deps AS build
COPY packages/types ./packages/types
COPY apps/api ./apps/api
RUN pnpm --filter @doc-to-audio/types build
RUN pnpm --filter @doc-to-audio/api db:generate
RUN pnpm --filter @doc-to-audio/api build

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
COPY --from=build /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
CMD ["./docker-entrypoint.sh"]

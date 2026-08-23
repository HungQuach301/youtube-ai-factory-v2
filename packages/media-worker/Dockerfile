FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS build

WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/contracts ./packages/contracts
COPY packages/core-hash ./packages/core-hash
COPY packages/media-worker ./packages/media-worker
RUN corepack enable \
  && corepack prepare pnpm@11.19.0 --activate \
  && pnpm install --frozen-lockfile \
  && pnpm exec tsc -b packages/contracts packages/core-hash packages/media-worker

FROM node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/contracts ./packages/contracts
COPY --from=build /src/packages/core-hash ./packages/core-hash
COPY --from=build /src/packages/media-worker/dist ./dist
COPY --from=build /src/packages/media-worker/container-entry.mjs ./container-entry.mjs
USER node

ENTRYPOINT ["node", "container-entry.mjs"]

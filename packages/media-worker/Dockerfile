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
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir \
       --index-url https://download.pytorch.org/whl/cpu torch==2.8.0 torchaudio==2.8.0 \
  && python3 -m pip install --break-system-packages --no-cache-dir whisperx==3.4.2 g2p-en==2.1.0 \
  && python3 -m nltk.downloader -q averaged_perceptron_tagger averaged_perceptron_tagger_eng cmudict \
  && rm -rf /var/lib/apt/lists/* /root/.cache/pip

WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/contracts ./packages/contracts
COPY --from=build /src/packages/core-hash ./packages/core-hash
COPY --from=build /src/packages/media-worker ./packages/media-worker
COPY scripts/whisperx-phoneme-observer.py ./scripts/whisperx-phoneme-observer.py
WORKDIR /app/packages/media-worker
USER node

ENTRYPOINT ["node", "container-entry.mjs"]

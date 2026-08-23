import type { MediaWorkerPorts } from '@youtube-ai-factory/media-worker'

declare const ports: MediaWorkerPorts

// @ts-expect-error G3: media workers do not receive a D1 binding.
ports.d1

// @ts-expect-error G3: media workers do not expose a database write port.
ports.database

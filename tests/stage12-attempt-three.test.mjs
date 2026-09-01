import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)

function insert(db, { id, attempt, retryOf, state, error }) {
  return db.prepare(`INSERT INTO stage12_media_job
    (id, package_id, operation_run_id, stage_instance_id, attempt_ordinal,
     retry_of_job_id, idempotency_key, callback_token_hash, state, error_code,
     created_at, updated_at)
    VALUES (?, 'pkg', 'run', 's12', ?, ?, ?, ?, ?, ?, 'now', 'now')`).run(
    id, attempt, retryOf, id.padEnd(64, 'a').slice(0, 64),
    id.padEnd(64, 'b').slice(0, 64), state, error,
  )
}

test('Stage 12 renderer smoke produces a valid WebM', async () => {
  const { stdout } = await execFileAsync(process.execPath,
    ['packages/media-worker/stage12-render-smoke.mjs'])
  assert.match(stdout, /STAGE12_RENDER_SMOKE_PASS/u)
})

test('Stage 12 migration preserves history and permits only attempt three', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE production_package (id text PRIMARY KEY);
    CREATE TABLE operation_run (id text PRIMARY KEY);
    CREATE TABLE stage12_media_job (
      id text PRIMARY KEY NOT NULL,
      package_id text NOT NULL REFERENCES production_package(id),
      operation_run_id text NOT NULL REFERENCES operation_run(id),
      stage_instance_id text NOT NULL,
      idempotency_key text NOT NULL CHECK (length(idempotency_key) = 64),
      callback_token_hash text NOT NULL CHECK (length(callback_token_hash) = 64),
      state text NOT NULL CHECK (state IN ('PENDING', 'READY', 'FAILED')),
      receipt_r2_key text, receipt_sha256 text, worker_image_digest text,
      error_code text, created_at text NOT NULL, updated_at text NOT NULL,
      attempt_ordinal integer NOT NULL CHECK (attempt_ordinal BETWEEN 1 AND 2),
      retry_of_job_id text
    );
    CREATE UNIQUE INDEX stage12_media_job_package_attempt_unique
      ON stage12_media_job (package_id, attempt_ordinal);
    CREATE UNIQUE INDEX stage12_media_job_retry_of_unique
      ON stage12_media_job (retry_of_job_id) WHERE retry_of_job_id IS NOT NULL;
    CREATE UNIQUE INDEX stage12_media_job_key_unique
      ON stage12_media_job (idempotency_key);
    INSERT INTO production_package VALUES ('pkg');
    INSERT INTO operation_run VALUES ('run');`)
  insert(db, { id: 'attempt-1', attempt: 1, retryOf: null,
    state: 'FAILED', error: 'MEDIA_TOOL_FAILED' })
  insert(db, { id: 'attempt-2', attempt: 2, retryOf: 'attempt-1',
    state: 'FAILED', error: 'STAGE12_RENDER_FAILED' })
  const migration = await readFile('drizzle/0020_stage12_attempt_three.sql', 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) db.exec(statement)
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM stage12_media_job').get().count, 2)
  assert.doesNotThrow(() => insert(db, { id: 'attempt-3', attempt: 3,
    retryOf: 'attempt-2', state: 'PENDING', error: null }))
  assert.throws(() => insert(db, { id: 'attempt-4', attempt: 4,
    retryOf: 'attempt-3', state: 'PENDING', error: null }))
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('Stage 12 attempt-three recovery reuses the immutable pre-master without rendering', async () => {
  const [runtime, worker, domain, objectRoute, migration] = await Promise.all([
    readFile('packages/media-worker/stage12-runtime.mjs', 'utf8'),
    readFile('packages/media-worker/container-entry.mjs', 'utf8'),
    readFile('app/track-g-video-one.ts', 'utf8'),
    readFile('app/api/media-worker/stage12/route.ts', 'utf8'),
    readFile('drizzle/0021_stage12_attempt_three_recovery.sql', 'utf8'),
  ])
  const recovery = runtime.slice(runtime.indexOf('export async function executeStage12Recovery'))
  assert.match(recovery, /inspectPreMaster\(payload, preMasterPath, workRoot\)/u)
  assert.match(recovery, /recovery\.render !== false/u)
  assert.doesNotMatch(recovery, /libvpx-vp9/u)
  assert.doesNotMatch(recovery, /uploadPreMaster/u)
  assert.match(worker, /request\.url === '\/stage12\/recover'/u)
  assert.match(worker, /body\?\.error/u)
  assert.match(domain, /RECOVER_TRACK_G_VIDEO_1_STAGE_12_ATTEMPT_3/u)
  assert.match(domain, /attemptOrdinal !== 3/u)
  assert.match(domain, /candidates\.length !== 1/u)
  assert.match(domain, /job\.errorCode === "STAGE12_CALLBACK_FAILED:422"/u)
  assert.match(domain, /error_code = 'STAGE12_CALLBACK_FAILED:422'/u)
  assert.match(domain, /attempt_ordinal = 3 AND state = 'FAILED'/u)
  assert.doesNotMatch(domain, /attemptOrdinal:\s*4/u)
  assert.match(objectRoute, /kind === "pre-master"/u)
  assert.match(migration, /TRACK_G_VIDEO_1_STAGE_12_FAILED/u)
  assert.match(migration, /TRACK_G_VIDEO_1_STAGE_12_PENDING/u)
})

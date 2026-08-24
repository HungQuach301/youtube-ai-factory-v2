import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../db/migrations/0014_observability.sql', import.meta.url), 'utf8')

function section(name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []

function createDb() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec(section('up'))
  return db
}

function insert(db, input) {
  db.prepare(`INSERT INTO trace_event (
    id, trace_id, sequence_no, package_id, stage_instance_id, event_type, span_id,
    reservation_id, request_r2_key, response_r2_key, latency_ms, error_class, cost_usd,
    output_id, output_r2_key, output_sha256, gate_code, gate_state, evidence_r2_key,
    outcome, occurred_at, canonical_hash
  ) VALUES (
    $id, $traceId, $sequence, 'pkg', 'stage', $eventType, $spanId,
    $reservationId, $requestR2Key, $responseR2Key, $latencyMs, $errorClass, $costUsd,
    $outputId, $outputR2Key, $outputSha256, $gateCode, $gateState, $evidenceR2Key,
    $outcome, '2026-08-24', $canonicalHash
  )`).run({
      id: input.id, traceId: 'trace', sequence: input.sequence, eventType: input.eventType,
      spanId: input.spanId ?? null, reservationId: input.reservationId ?? null,
      requestR2Key: input.requestR2Key ?? null, responseR2Key: input.responseR2Key ?? null,
      latencyMs: input.latencyMs ?? null, errorClass: input.errorClass ?? null,
      costUsd: input.costUsd ?? null, outputId: input.outputId ?? null,
      outputR2Key: input.outputR2Key ?? null, outputSha256: input.outputSha256 ?? null,
      gateCode: input.gateCode ?? null, gateState: input.gateState ?? null,
      evidenceR2Key: `ops/${input.id}.json`, outcome: input.outcome ?? null,
      canonicalHash: hash,
    })
}

const hash = 'a'.repeat(64)

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0014_observability', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = createDb()
    db.exec(section('down'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section('up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='trace_event'").get().count).toBe(1)
      db.exec(section('down'))
    }
  })

  it('enforces a contiguous append-only stage chain and complete provider lifecycle', () => {
    const db = createDb()
    insert(db, { id: 'e0', sequence: 0, eventType: 'STAGE_ATTEMPT_STARTED' })
    expect(() => insert(db, { id: 'gap', sequence: 2, eventType: 'OUTPUT_SEALED', outputId: 'out', outputR2Key: 'prod/out.json', outputSha256: hash }))
      .toThrow(/sequence must be contiguous/iu)
    insert(db, { id: 'e1', sequence: 1, eventType: 'PROVIDER_REQUESTED', spanId: 'span', reservationId: 'reservation', requestR2Key: 'evidence/request.json.gz' })
    expect(() => insert(db, { id: 'bad-complete', sequence: 2, eventType: 'STAGE_ATTEMPT_COMPLETED', outcome: 'FAILED' }))
      .toThrow(/provider lifecycle is incomplete/iu)
    insert(db, { id: 'e2', sequence: 2, eventType: 'PROVIDER_RESPONDED', spanId: 'span', responseR2Key: 'evidence/response.json.gz', latencyMs: 120 })
    insert(db, { id: 'e3', sequence: 3, eventType: 'COST_SETTLED', spanId: 'span', reservationId: 'reservation', costUsd: 0.2 })
    insert(db, { id: 'e4', sequence: 4, eventType: 'OUTPUT_SEALED', outputId: 'out', outputR2Key: 'prod/out.json', outputSha256: hash })
    insert(db, { id: 'e5', sequence: 5, eventType: 'STAGE_ATTEMPT_COMPLETED', outcome: 'SUCCEEDED' })
    expect(() => db.exec("UPDATE trace_event SET outcome='FAILED' WHERE id='e5'")).toThrow(/append-only/iu)
    expect(() => insert(db, { id: 'late', sequence: 6, eventType: 'OUTPUT_SEALED', outputId: 'late', outputR2Key: 'prod/late.json', outputSha256: hash }))
      .toThrow(/already terminal/iu)
  })

  it('hard-labels qualification fixtures and forbids release-candidate promotion', () => {
    const db = createDb()
    db.exec("INSERT INTO operator_fixture VALUES ('fixture', 'QUALIFICATION FIXTURE — NOT A RELEASE CANDIDATE', 0, '2026-08-24')")
    expect(() => db.exec("INSERT INTO operator_fixture VALUES ('bad', 'fixture', 0, '2026-08-24')"))
      .toThrow(/CHECK constraint/iu)
    expect(() => db.exec("UPDATE operator_fixture SET release_candidate=1 WHERE id='fixture'"))
      .toThrow(/append-only/iu)
  })
})

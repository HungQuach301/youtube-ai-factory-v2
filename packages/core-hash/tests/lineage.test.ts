import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

import { LineageStore, type LineageDatabase } from '../src/index.js'
import type { ArtifactId, Hex64 } from '../../contracts/src/index.js'

const HASH = 'a'.repeat(64) as Hex64

function artifactId(value: string): ArtifactId {
  return value as ArtifactId
}

function createStore(): { db: DatabaseSync; store: LineageStore } {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE artifact (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      canonical_hash TEXT NOT NULL
    );
    CREATE TABLE artifact_lineage (
      parent_artifact_id TEXT NOT NULL REFERENCES artifact(id),
      child_artifact_id TEXT NOT NULL REFERENCES artifact(id),
      relation TEXT NOT NULL,
      PRIMARY KEY (parent_artifact_id, child_artifact_id, relation)
    );
    CREATE TABLE quarantine_hash (
      hash TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  const adapter: LineageDatabase = {
    query<Row>(sql: string, parameters: readonly unknown[]): readonly Row[] {
      return db.prepare(sql).all(...parameters) as Row[]
    },
    execute(sql: string, parameters: readonly unknown[]): void {
      db.prepare(sql).run(...parameters)
    },
    async transaction<Result>(work: () => Promise<Result>): Promise<Result> {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = await work()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
  return { db, store: new LineageStore(adapter) }
}

const databases: DatabaseSync[] = []
afterEach(() => {
  while (databases.length > 0) databases.pop()?.close()
})

describe('recursive lineage', () => {
  it('returns every ancestor at depth ten in deterministic order', async () => {
    const { db, store } = createStore()
    databases.push(db)
    const insertArtifact = db.prepare('INSERT INTO artifact VALUES (?, ?, ?)')
    const insertEdge = db.prepare('INSERT INTO artifact_lineage VALUES (?, ?, ?)')
    for (let index = 0; index <= 10; index += 1) insertArtifact.run(`a${index}`, 'production', HASH)
    for (let index = 0; index < 10; index += 1) insertEdge.run(`a${index}`, `a${index + 1}`, 'derived-from')

    const result = await store.ancestors(artifactId('a10'), 10)
    expect(result).toEqual(Array.from({ length: 10 }, (_, index) => artifactId(`a${9 - index}`)))
  })

  it('rejects a lineage edge that would create a cycle', async () => {
    const { db, store } = createStore()
    databases.push(db)
    db.exec(`
      INSERT INTO artifact VALUES ('a0', 'production', '${HASH}');
      INSERT INTO artifact VALUES ('a1', 'production', '${HASH}');
      INSERT INTO artifact_lineage VALUES ('a0', 'a1', 'derived-from');
    `)
    await expect(store.addLineage(artifactId('a1'), artifactId('a0'), 'cycle')).rejects.toThrow(/cycle/iu)
  })

  it('fails closed when a quarantined hash is used as input', async () => {
    const { db, store } = createStore()
    databases.push(db)
    db.prepare('INSERT INTO quarantine_hash VALUES (?, ?, ?)').run(HASH, 'known bad input', '2026-08-22T00:00:00Z')
    await expect(store.assertUsableInputHash(HASH)).rejects.toThrow(/quarantined/iu)
  })

  it('rejects non-production parents for production children', async () => {
    const { db, store } = createStore()
    databases.push(db)
    db.exec(`
      INSERT INTO artifact VALUES ('qual', 'qualification', '${HASH}');
      INSERT INTO artifact VALUES ('prod', 'production', '${HASH}');
    `)
    await expect(store.addLineage(artifactId('qual'), artifactId('prod'), 'invalid')).rejects.toThrow(/non-production/iu)
  })
})

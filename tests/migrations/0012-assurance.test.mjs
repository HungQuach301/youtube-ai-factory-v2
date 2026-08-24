import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const read = (name) => readFileSync(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8')
const migrations = {
  control: read('0001_control_core.sql'),
  capability: read('0002_capability.sql'),
  quality: read('0005_quality.sql'),
  human: read('0009_human.sql'),
  assurance: read('0012_assurance.sql'),
}

function section(migration, name) {
  const start = `-- migrate:${name}`
  const other = name === 'up' ? '-- migrate:down' : '-- migrate:end'
  return migration.slice(migration.indexOf(start) + start.length, migration.indexOf(other)).trim()
}

const databases = []

function createBase() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(section(migrations.control, 'up'))
  db.exec(section(migrations.capability, 'up'))
  db.exec('CREATE TABLE master (id TEXT PRIMARY KEY)')
  db.exec(section(migrations.quality, 'up'))
  db.exec(section(migrations.human, 'up'))
  db.exec(`
    INSERT INTO channel VALUES ('c', 'Channel', 'ACTIVE', '2026-08-24');
    INSERT INTO pillar VALUES ('p', 'c', 'Pillar', 1);
    INSERT INTO episode VALUES ('e', 'p', 1, 'QUEUED');
    INSERT INTO channel_identity_contract VALUES ('identity', 'c', 1, '{}', '${'a'.repeat(64)}', NULL, NULL);
    INSERT INTO production_package VALUES ('pkg', 'e', 'c', 'production', 'brief', 'identity', NULL, 0, NULL, 1, 1.0, 0, 0, 'OPEN', '2026-08-24');
    INSERT INTO human_actor VALUES ('human-owner', 'Human owner fixture', 'OWNER', 0, 1);
  `)
  db.exec(section(migrations.assurance, 'up'))
  return db
}

function addQualifiedCritic(db, ordinal) {
  db.exec(`
    INSERT INTO capability VALUES (
      'cap-${ordinal}', 'CRITIC_${ordinal}', 'CONTROL', '1', 'fixture', 'model-2026-08-24',
      '${String(ordinal).repeat(64).slice(0, 64)}', 'ACTIVE', '2026-08-24'
    );
    INSERT INTO archetype VALUES ('arch-${ordinal}', 'ARCH_${ordinal}', 'CONTROL', 'CRITICAL', 1.0);
    INSERT INTO qualification_run VALUES (
      'qr-${ordinal}', 'cap-${ordinal}', 'arch-${ordinal}', NULL, 'qualification',
      1.0, 1.0, 1.0, 0.0, 'qualification/critic-${ordinal}.json', 'PASS', 0.0, '2026-08-24'
    );
    INSERT INTO capability_archetype_binding VALUES (
      'cap-${ordinal}', 'arch-${ordinal}', 'QUALIFIED', '2026-08-24', 'qr-${ordinal}'
    );
  `)
}

afterEach(() => {
  while (databases.length > 0) databases.pop().close()
})

describe('migration 0012_assurance', () => {
  it('runs UP/DOWN twice without residue', () => {
    const db = createBase()
    db.exec(section(migrations.assurance, 'down'))
    for (let run = 0; run < 2; run += 1) {
      db.exec(section(migrations.assurance, 'up'))
      expect(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='rubric_anchor'").get().count).toBe(1)
      db.exec(section(migrations.assurance, 'down'))
    }
  })

  it('keeps HARD_GATE fail-closed without 36 human-selected anchors', () => {
    const db = createBase()
    db.exec("INSERT INTO assurance_activation VALUES ('activation', 1, 'REDUCED', 'WARNING_ONLY', NULL, NULL, NULL, NULL, NULL, '2026-08-24')")
    expect(() => db.exec(`
      UPDATE assurance_activation SET mode='HARD_GATE', anchor_set_hash='${'a'.repeat(64)}',
        gold_set_evidence_r2_key='qualification/gold.json',
        qualification_evidence_r2_key='qualification/critics.json',
        activated_by='human-owner', activated_at='2026-08-24' WHERE id='activation'
    `)).toThrow(/requires 36 real-human rubric anchors/iu)
  })

  it('rejects an assurance assignment without a qualified binding', () => {
    const db = createBase()
    db.exec(`
      INSERT INTO assurance_activation VALUES ('activation', 1, 'REDUCED', 'WARNING_ONLY', NULL, NULL, NULL, NULL, NULL, '2026-08-24');
      INSERT INTO capability VALUES ('cap', 'CRITIC', 'CONTROL', '1', 'fixture', 'model-2026-08-24', '${'b'.repeat(64)}', 'ACTIVE', '2026-08-24');
      INSERT INTO archetype VALUES ('arch', 'ARCH', 'CONTROL', 'CRITICAL', 1.0);
    `)
    expect(() => db.exec("INSERT INTO assurance_critic_assignment VALUES ('activation', 'TRUTH_BRAND_SAFETY', 'cap', 'arch')"))
      .toThrow(/assignment is not QUALIFIED/iu)
  })

  it('promotes only a complete REDUCED activation with qualified critics', () => {
    const db = createBase()
    db.exec("INSERT INTO assurance_activation VALUES ('activation', 1, 'REDUCED', 'WARNING_ONLY', NULL, NULL, NULL, NULL, NULL, '2026-08-24')")
    const codes = ['TRUTH_BRAND_SAFETY', 'SEMANTIC_ALIGNMENT', 'STORY_RETENTION', 'PACKAGING_CTR']
    codes.forEach((code, index) => {
      addQualifiedCritic(db, index + 1)
      db.prepare('INSERT INTO assurance_critic_assignment VALUES (?, ?, ?, ?)')
        .run('activation', code, `cap-${index + 1}`, `arch-${index + 1}`)
    })
    const dimensions = [
      'FACTUAL_SAFETY','SEMANTIC_ALIGNMENT','VOICE_INTELLIGIBILITY','STORY_PAYOFF',
      'VISUAL_DIRECTION','MUSIC_SOUND_DESIGN','RETENTION','MOBILE_LEGIBILITY',
      'PACKAGING_CTR','EXECUTIVE_PRODUCER','COMPETITIVE_EDITOR','OVERALL',
    ]
    const levels = ['FAIL', 'BORDERLINE', 'PASS']
    for (const dimension of dimensions) {
      for (const level of levels) {
        db.prepare('INSERT INTO rubric_anchor VALUES (?, 1, ?, ?, ?, ?, ?, ?)').run(
          `${dimension}-${level}`, dimension, level,
          `qualification/rubric/${dimension}/${level}.json`, 'c'.repeat(64),
          'human-owner', '2026-08-24',
        )
      }
    }
    expect(() => db.exec(`
      UPDATE assurance_activation SET mode='HARD_GATE', anchor_set_hash='${'d'.repeat(64)}',
        gold_set_evidence_r2_key='qualification/gold.json',
        qualification_evidence_r2_key='qualification/critics.json',
        activated_by='human-owner', activated_at='2026-08-24' WHERE id='activation'
    `)).not.toThrow()
  })

  it('blocks M2 persistence until every active M0/M1 evaluation is PASS', () => {
    const db = createBase()
    db.exec(`
      INSERT INTO gate_definition VALUES ('m0', 'RIGHTS', 'M0', '[]', 1, NULL, 10, 1);
      INSERT INTO gate_definition VALUES ('m1', 'TECHNICAL', 'M1', '[]', 1, NULL, 10, 1);
      INSERT INTO gate_definition VALUES ('m2', 'EDITORIAL', 'M2', '[]', 1, NULL, 10, 1);
      INSERT INTO gate_evaluation VALUES ('e0', 'pkg', 'm0', 'PASS', 'evidence/m0.json', NULL, NULL, '2026-08-24');
      INSERT INTO gate_evaluation VALUES ('e1', 'pkg', 'm1', 'FAIL', 'evidence/m1.json', NULL, NULL, '2026-08-24');
    `)
    expect(() => db.exec("INSERT INTO gate_evaluation VALUES ('e2', 'pkg', 'm2', 'FAIL', 'evidence/m2.json', NULL, NULL, '2026-08-24')"))
      .toThrow(/M2 requires every active M0\/M1 gate to PASS/iu)
    db.exec("UPDATE gate_evaluation SET state='PASS' WHERE id='e1'")
    expect(() => db.exec("INSERT INTO gate_evaluation VALUES ('e2', 'pkg', 'm2', 'PASS', 'evidence/m2.json', NULL, NULL, '2026-08-24')"))
      .not.toThrow()
  })
})

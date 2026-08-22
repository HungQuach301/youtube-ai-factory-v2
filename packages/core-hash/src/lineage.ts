import type { ArtifactId, Hex64, Namespace } from '@youtube-ai-factory/contracts'

type MaybePromise<Value> = Value | Promise<Value>

export interface LineageDatabase {
  query<Row>(sql: string, parameters: readonly unknown[]): MaybePromise<readonly Row[]>
  execute(sql: string, parameters: readonly unknown[]): MaybePromise<void>
  transaction<Result>(work: () => Promise<Result>): Promise<Result>
}

interface AncestorRow {
  artifact_id: string
  depth: number
}

interface ArtifactRow {
  id: string
  namespace: Namespace
  canonical_hash: string
}

interface CountRow {
  count: number
}

export const ANCESTORS_SQL = `
WITH RECURSIVE ancestor_tree(artifact_id, depth, path) AS (
  SELECT parent_artifact_id, 1, ',' || parent_artifact_id || ','
  FROM artifact_lineage
  WHERE child_artifact_id = ?
  UNION ALL
  SELECT edge.parent_artifact_id, tree.depth + 1,
         tree.path || edge.parent_artifact_id || ','
  FROM artifact_lineage AS edge
  JOIN ancestor_tree AS tree ON edge.child_artifact_id = tree.artifact_id
  WHERE (? IS NULL OR tree.depth < ?)
    AND instr(tree.path, ',' || edge.parent_artifact_id || ',') = 0
)
SELECT artifact_id, MIN(depth) AS depth
FROM ancestor_tree
GROUP BY artifact_id
ORDER BY depth, artifact_id
`.trim()

export class LineageStore {
  constructor(private readonly database: LineageDatabase) {}

  async ancestors(id: ArtifactId, depth?: number): Promise<readonly ArtifactId[]> {
    if (depth !== undefined && (!Number.isInteger(depth) || depth < 1)) {
      throw new RangeError('Lineage depth must be a positive integer')
    }
    const rows = await this.database.query<AncestorRow>(ANCESTORS_SQL, [id, depth ?? null, depth ?? null])
    return rows.map((row) => row.artifact_id as ArtifactId)
  }

  async isQuarantined(hash: Hex64): Promise<boolean> {
    const rows = await this.database.query<CountRow>(
      'SELECT COUNT(*) AS count FROM quarantine_hash WHERE hash = ?',
      [hash]
    )
    return (rows[0]?.count ?? 0) > 0
  }

  async assertUsableInputHash(hash: Hex64): Promise<void> {
    if (await this.isQuarantined(hash)) throw new Error(`Input hash is quarantined: ${hash}`)
  }

  async addLineage(parent: ArtifactId, child: ArtifactId, relation: string): Promise<void> {
    if (relation.trim().length === 0) throw new TypeError('Lineage relation cannot be empty')
    await this.database.transaction(async () => {
      if (parent === child) throw new Error('Lineage cycle: an artifact cannot parent itself')
      const artifacts = await this.database.query<ArtifactRow>(
        'SELECT id, namespace, canonical_hash FROM artifact WHERE id IN (?, ?)',
        [parent, child]
      )
      const parentArtifact = artifacts.find((artifact) => artifact.id === parent)
      const childArtifact = artifacts.find((artifact) => artifact.id === child)
      if (!parentArtifact || !childArtifact) throw new Error('Lineage endpoints must both exist')
      if (childArtifact.namespace === 'production' && parentArtifact.namespace !== 'production') {
        throw new Error('G5: non-production artifact cannot parent a production artifact')
      }
      await this.assertUsableInputHash(parentArtifact.canonical_hash as Hex64)
      const existingAncestors = await this.ancestors(parent)
      if (existingAncestors.includes(child)) throw new Error('Lineage cycle detected')
      await this.database.execute(
        'INSERT INTO artifact_lineage (parent_artifact_id, child_artifact_id, relation) VALUES (?, ?, ?)',
        [parent, child, relation]
      )
    })
  }
}

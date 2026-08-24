import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function unwrap(node) {
  let current = node
  while (ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isParenthesizedExpression(current)) current = current.expression
  return current
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  throw new Error(`G11: unsupported computed threshold key: ${node.getText()}`)
}

function literalValue(rawNode) {
  const node = unwrap(rawNode)
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(unwrap(node.operand))) {
    const value = Number(unwrap(node.operand).text)
    if (node.operator === ts.SyntaxKind.MinusToken) return -value
    if (node.operator === ts.SyntaxKind.PlusToken) return value
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literalValue)
  if (ts.isObjectLiteralExpression(node)) {
    const value = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`G11: threshold objects must use explicit property assignments: ${property.getText()}`)
      }
      value[propertyName(property.name)] = literalValue(property.initializer)
    }
    return value
  }
  throw new Error(`G11: threshold value must be statically literal: ${node.getText()}`)
}

export function parseThresholdSource(sourceText) {
  const source = ts.createSourceFile('thresholds.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (source.parseDiagnostics.length > 0) throw new Error(`G11: thresholds.ts parse failed: ${source.parseDiagnostics[0].messageText}`)
  const exports = {}
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)
      || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue
      exports[declaration.name.text] = literalValue(declaration.initializer)
    }
  }
  return exports
}

function flatten(value, path = '', output = new Map()) {
  if (Array.isArray(value) || value === null || typeof value !== 'object') {
    output.set(path, value)
    return output
  }
  for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}.${key}` : key, output)
  return output
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function numericPolicy(path) {
  const leaf = path.split('.').at(-1)
  if (leaf === 'min') return 'MINIMUM'
  if (leaf === 'max') return 'MAXIMUM'
  const normalized = path.toUpperCase()
  if (/(^|\.)([^.]*_)?(MIN|FLOOR|RECALL|PRECISION|YIELD)(_|\.|$)/u.test(normalized)) return 'MINIMUM'
  if (/(^|\.)([^.]*_)?(MAX|CEILING|TOLERANCE|VARIANCE)(_|\.|$)/u.test(normalized)) return 'MAXIMUM'
  return 'AMBIGUOUS'
}

function classify(path, before, after) {
  if (before === undefined) return 'TIGHTEN'
  if (after === undefined) return 'RELAX'
  if (typeof before === 'number' && typeof after === 'number') {
    const policy = numericPolicy(path)
    if (policy === 'MINIMUM') return after > before ? 'TIGHTEN' : 'RELAX'
    if (policy === 'MAXIMUM') return after < before ? 'TIGHTEN' : 'RELAX'
    return 'RELAX'
  }
  if (typeof before === 'boolean' && typeof after === 'boolean') return after ? 'TIGHTEN' : 'RELAX'
  if (Array.isArray(before) && Array.isArray(after)) {
    const removesOnly = after.every((value) => before.includes(value))
    return removesOnly ? 'TIGHTEN' : 'RELAX'
  }
  return 'RELAX'
}

export function analyzeThresholdDiff(beforeSource, afterSource) {
  const before = flatten(parseThresholdSource(beforeSource))
  const after = flatten(parseThresholdSource(afterSource))
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort()
  return paths.flatMap((path) => {
    const oldValue = before.get(path)
    const newValue = after.get(path)
    if (sameValue(oldValue, newValue)) return []
    return [{ path, before: oldValue, after: newValue, direction: classify(path, oldValue, newValue) }]
  })
}

function exactStringSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value))
}

export function validatePromotionEvidence({ before, after, changes, evidence }) {
  const relaxedPaths = changes.filter((change) => change.direction === 'RELAX').map((change) => change.path)
  if (relaxedPaths.length === 0) return { valid: true, relaxedPaths }
  if (evidence === null || typeof evidence !== 'object') throw new Error('G11: RELAX requires promotion evidence')
  const requiredStrings = ['proposalId', 'promotionId', 'ownerIdentity', 'ownerSignature', 'evidenceR2Key']
  if (evidence.status !== 'PROMOTED' || evidence.strictnessDirection !== 'RELAX'
    || requiredStrings.some((key) => typeof evidence[key] !== 'string' || evidence[key].trim() === '')) {
    throw new Error('G11: RELAX requires exact PROMOTED owner-signed evidence')
  }
  if (!/^[a-f0-9]{64}$/u.test(evidence.evidenceHash ?? '')) throw new Error('G11: promotion evidence hash must be lowercase hex64')
  if (evidence.beforeSourceSha256 !== sha256(before) || evidence.afterSourceSha256 !== sha256(after)) {
    throw new Error('G11: promotion evidence source hash does not match the sealed diff')
  }
  if (!Array.isArray(evidence.changedPaths) || !exactStringSet(evidence.changedPaths, relaxedPaths)) {
    throw new Error('G11: promotion evidence must cover every and only RELAX path')
  }
  return { valid: true, relaxedPaths }
}

function gitShow(revision, path) {
  const result = spawnSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`G11: unable to read sealed thresholds from ${revision}: ${result.stderr.trim()}`)
  return result.stdout
}

function findEvidence(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, value: JSON.parse(readFileSync(join(directory, name), 'utf8')) }))
}

export function runThresholdDiff({
  baseSha = process.env.BASE_SHA,
  thresholdPath = 'packages/contracts/src/thresholds.ts',
  evidenceDirectory = 'evidence/evolution-promotions',
} = {}) {
  if (!baseSha) throw new Error('G11: BASE_SHA is required for sealed threshold comparison')
  const before = gitShow(baseSha, thresholdPath)
  const after = readFileSync(resolve(thresholdPath), 'utf8')
  const changes = analyzeThresholdDiff(before, after)
  const relaxed = changes.filter((change) => change.direction === 'RELAX')
  if (relaxed.length === 0) return { changes, evidenceFile: null }

  const candidates = findEvidence(resolve(evidenceDirectory))
  const valid = []
  for (const candidate of candidates) {
    try {
      validatePromotionEvidence({ before, after, changes, evidence: candidate.value })
      valid.push(candidate.name)
    } catch {
      // A non-matching promotion cannot authorize this sealed diff.
    }
  }
  if (valid.length !== 1) {
    throw new Error(`G11: RELAX requires exactly one matching promoted evidence file; found ${valid.length}`)
  }
  return { changes, evidenceFile: valid[0] }
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  try {
    const result = runThresholdDiff()
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

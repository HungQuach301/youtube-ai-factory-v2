import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildToolInvocation, MediaWorkerRuntime } from './dist/index.js'

const IMAGE_DIGEST = process.env.MEDIA_IMAGE_DIGEST
if (!IMAGE_DIGEST?.match(/^sha256:[a-f0-9]{64}$/u)) {
  throw new Error('MEDIA_IMAGE_DIGEST must be the immutable digest of the running image.')
}
const JOB_DISPATCH_ENABLED = process.env.MEDIA_JOB_DISPATCH_ENABLED === 'true'

function run(executable, args, cwd, deadlineAt) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    const remainingMs = Date.parse(deadlineAt) - Date.now()
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      child.kill('SIGKILL')
      reject(Object.assign(new Error('Media job deadline has expired.'), { code: 'DEADLINE_EXCEEDED' }))
      return
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), remainingMs)
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (signal === 'SIGKILL' && Date.now() >= Date.parse(deadlineAt)) {
        reject(Object.assign(new Error('Media tool exceeded its deadline.'), { code: 'DEADLINE_EXCEEDED' }))
        return
      }
      if (code === 0) {
        resolve(Buffer.concat(stdout))
        return
      }
      reject(new Error(`${executable} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`))
    })
  })
}

function accessMap(entries) {
  if (!Array.isArray(entries)) throw new Error('Object access must be an array.')
  return new Map(entries.map((entry) => {
    if (typeof entry?.key !== 'string') throw new Error('Object access key is required.')
    return [entry.key, entry]
  }))
}

async function processJob(message) {
  const access = accessMap(message?.access?.objects)
  const commandUrl = message?.access?.commandUrl
  if (typeof commandUrl !== 'string' || !commandUrl.startsWith('https://')) throw new Error('A scoped HTTPS command URL is required.')
  const workRoot = await mkdtemp(join(tmpdir(), 'factory-media-'))
  const inputRoot = join(workRoot, 'input')
  const outputRoot = join(workRoot, 'output')
  await mkdir(inputRoot, { recursive: true })
  await mkdir(outputRoot, { recursive: true })
  const started = performance.now()
  const ports = {
    imageDigest: IMAGE_DIGEST,
    clock: { now: () => new Date(), monotonicMs: () => performance.now() - started },
    objectStore: {
      async get(key) {
        const entry = access.get(key)
        if (typeof entry?.readUrl !== 'string') return null
        const response = await fetch(entry.readUrl, { method: 'GET', redirect: 'error' })
        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
      },
      async putImmutable(key, bytes) {
        const entry = access.get(key)
        if (typeof entry?.writeUrl !== 'string') throw new Error(`No scoped write URL for ${key}`)
        const response = await fetch(entry.writeUrl, { method: 'PUT', body: bytes, redirect: 'error' })
        if (!response.ok) throw new Error(`Object write failed with status ${response.status}`)
      },
    },
    executor: {
      async execute(spec, inputs, deadlineAt) {
        await Promise.all(inputs.map(async (input) => writeFile(join(inputRoot, String(input.index)), input.bytes)))
        const invocation = buildToolInvocation(spec)
        const containerOutput = join(outputRoot, spec.artifactName)
        const args = invocation.args.map((arg) => arg.replace('/work/input/', `${inputRoot}/`).replace('/work/output/', `${outputRoot}/`))
        const stdout = await run(invocation.executable, args, workRoot, deadlineAt)
        const bytes = spec.operation === 'PROBE' ? stdout : await readFile(containerOutput)
        return [{ name: spec.artifactName, bytes: new Uint8Array(bytes) }]
      },
    },
    completionPublisher: {
      async publish(completion) {
        const response = await fetch(commandUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(completion),
          redirect: 'error',
        })
        if (!response.ok) throw new Error(`Control-plane command failed with status ${response.status}`)
      },
    },
  }
  try {
    return await new MediaWorkerRuntime(ports).consume(message.envelope)
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      ok: true,
      imageDigest: IMAGE_DIGEST,
      jobDispatchEnabled: JOB_DISPATCH_ENABLED,
    }))
    return
  }
  if (request.method !== 'POST' || request.url !== '/jobs') {
    response.writeHead(404).end()
    return
  }
  if (!JOB_DISPATCH_ENABLED) {
    response.writeHead(503, { 'content-type': 'application/json' }).end('{"ok":false,"code":"JOB_DISPATCH_DISABLED"}')
    return
  }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  try {
    const result = await processJob(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result))
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'WORKER_FAILED'
    response.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code }))
  }
})

server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0')

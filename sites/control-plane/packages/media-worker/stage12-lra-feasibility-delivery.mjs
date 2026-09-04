import { createHash } from 'node:crypto'

export const STAGE12_LRA_FEASIBILITY_DELIVERY_POLICY = Object.freeze({
  retryDelaysMs: Object.freeze([0, 1000, 3000]),
  heartbeatIntervalMs: 30_000,
})

function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('NON_FINITE_FEASIBILITY_DELIVERY_VALUE')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value !== 'object' || value === undefined) {
    throw new TypeError('INVALID_FEASIBILITY_DELIVERY_VALUE')
  }
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function hash(value) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function withoutBearerToken(value) {
  if (!value || typeof value !== 'object') return value
  const copy = { ...value }
  delete copy.token
  return copy
}

export function stage12LraFeasibilityRequestSha256(payload) {
  const execution = { ...payload }
  delete execution.durability
  return hash({
    ...execution,
    callback: withoutBearerToken(payload.callback),
    objectAccess: withoutBearerToken(payload.objectAccess),
  })
}

function immutableJson(value) {
  const clone = structuredClone(value)
  const freeze = (item) => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.freeze(item)
      for (const child of Object.values(item)) freeze(child)
    }
    return item
  }
  return freeze(clone)
}

function validateDurability(payload) {
  const durability = payload?.durability
  if (!/^[a-f0-9]{64}$/u.test(payload?.idempotencyKey ?? '')
    || !/^[a-f0-9]{64}$/u.test(durability?.requestSha256 ?? '')
    || !Number.isSafeInteger(durability?.fencingToken) || durability.fencingToken < 1
    || !/^[A-Za-z0-9_-]{1,160}$/u.test(durability?.leaseId ?? '')
    || typeof payload?.callback?.url !== 'string'
    || !/^[a-f0-9]{64}$/u.test(payload?.callback?.token ?? '')) {
    throw Object.assign(new Error('INVALID_STAGE12_LRA_FEASIBILITY_DURABILITY'), {
      code: 'INVALID_STAGE12_LRA_FEASIBILITY_DURABILITY',
    })
  }
  if (stage12LraFeasibilityRequestSha256(payload) !== durability.requestSha256) {
    throw Object.assign(new Error('Stage 12 feasibility request hash mismatch.'), {
      code: 'STAGE12_LRA_FEASIBILITY_REQUEST_HASH_MISMATCH',
    })
  }
  return durability
}

function defaultWait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function createStage12LraFeasibilityWorkerCoordinator(input) {
  const jobs = input.jobs ?? new Map()
  const startTransitions = new Map()
  const retryDelaysMs = input.retryDelaysMs
    ?? STAGE12_LRA_FEASIBILITY_DELIVERY_POLICY.retryDelaysMs
  const wait = input.wait ?? defaultWait
  const scheduleInterval = input.scheduleInterval
    ?? ((callback, delayMs) => setInterval(callback, delayMs))
  const cancelInterval = input.cancelInterval ?? ((timer) => clearInterval(timer))
  const heartbeatIntervalMs = input.heartbeatIntervalMs
    ?? STAGE12_LRA_FEASIBILITY_DELIVERY_POLICY.heartbeatIntervalMs

  const stopHeartbeat = async (job) => {
    if (job.heartbeatTimer) {
      cancelInterval(job.heartbeatTimer)
      job.heartbeatTimer = null
    }
    if (job.heartbeatPromise) await job.heartbeatPromise
  }

  const beginHeartbeat = (job) => {
    if (!input.heartbeat || job.heartbeatTimer || job.terminal
      || jobs.get(job.idempotencyKey) !== job) return
    const pulse = () => {
      if (job.heartbeatPromise || job.terminal
        || jobs.get(job.idempotencyKey) !== job) return
      const heartbeatSequence = job.heartbeatSequence + 1
      const heartbeatId = hash({ idempotencyKey: job.idempotencyKey,
        requestSha256: job.requestSha256, fencingToken: job.fencingToken,
        leaseId: job.leaseId, heartbeatSequence })
      const snapshot = { callback: job.callback, idempotencyKey: job.idempotencyKey,
        requestSha256: job.requestSha256, fencingToken: job.fencingToken,
        leaseId: job.leaseId, heartbeatId, heartbeatSequence }
      job.heartbeatPromise = Promise.resolve(input.heartbeat(snapshot)).then((ack) => {
        if (ack?.accepted !== true || ack.idempotencyKey !== snapshot.idempotencyKey
          || ack.requestSha256 !== snapshot.requestSha256
          || ack.fencingToken !== snapshot.fencingToken
          || ack.leaseId !== snapshot.leaseId || ack.heartbeatId !== heartbeatId
          || ack.heartbeatSequence !== heartbeatSequence
          || typeof ack.leaseExpiresAt !== 'string'
          || !Number.isFinite(Date.parse(ack.leaseExpiresAt))) {
          throw Object.assign(new Error('STAGE12_LRA_FEASIBILITY_HEARTBEAT_ACK_CONFLICT'),
            { retryable: false })
        }
        if (jobs.get(job.idempotencyKey) !== job
          || job.fencingToken !== snapshot.fencingToken) return
        job.heartbeatSequence = heartbeatSequence
        job.leaseExpiresAt = ack.leaseExpiresAt
        job.lastHeartbeatError = null
      }).catch((error) => {
        if (jobs.get(job.idempotencyKey) !== job
          || job.fencingToken !== snapshot.fencingToken) return
        job.lastHeartbeatError = error
        if (error?.retryable === false) {
          cancelInterval(job.heartbeatTimer)
          job.heartbeatTimer = null
        }
      }).finally(() => { job.heartbeatPromise = null })
    }
    job.heartbeatTimer = scheduleInterval(pulse, heartbeatIntervalMs)
    job.heartbeatTimer?.unref?.()
  }

  const deliverySnapshot = (job) => {
    const body = { idempotencyKey: job.idempotencyKey,
      requestSha256: job.requestSha256, fencingToken: job.fencingToken,
      leaseId: job.leaseId, terminalReceiptSha256: job.terminalReceiptSha256,
      ...(job.terminal.result !== undefined
        ? { result: job.terminal.result }
        : { errorCode: job.terminal.errorCode }) }
    return Object.freeze({
      callback: job.callback,
      requestSha256: job.requestSha256,
      fencingToken: job.fencingToken,
      leaseId: job.leaseId,
      terminalReceiptSha256: job.terminalReceiptSha256,
      body: new TextEncoder().encode(canonical(body)),
    })
  }

  const beginDelivery = (job) => {
    if (jobs.get(job.idempotencyKey) !== job || !job.terminal
      || job.acked || job.deliveryPromise
      || job.deliveryState === 'DELIVERY_CONFLICT') return
    const snapshot = deliverySnapshot(job)
    job.deliveryState = 'TERMINAL_PENDING_CALLBACK'
    job.deliveryPromise = (async () => {
      for (const delayMs of retryDelaysMs) {
        if (delayMs > 0) await wait(delayMs)
        if (job.fencingToken !== snapshot.fencingToken) return
        try {
          const acknowledgement = await input.deliver({ callback: snapshot.callback,
            body: snapshot.body, idempotencyKey: job.idempotencyKey,
            requestSha256: snapshot.requestSha256,
            fencingToken: snapshot.fencingToken, leaseId: snapshot.leaseId,
            terminalReceiptSha256: snapshot.terminalReceiptSha256 })
          if (acknowledgement?.terminalReceiptSha256 !== snapshot.terminalReceiptSha256
            || acknowledgement?.fencingToken !== snapshot.fencingToken
            || acknowledgement?.leaseId !== snapshot.leaseId
            || acknowledgement?.requestSha256 !== snapshot.requestSha256
            || acknowledgement?.idempotencyKey !== job.idempotencyKey
            || acknowledgement?.accepted !== true) {
            throw Object.assign(new Error('STAGE12_LRA_FEASIBILITY_CALLBACK_ACK_CONFLICT'),
              { retryable: false })
          }
          if (job.fencingToken !== snapshot.fencingToken) return
          job.acked = true
          job.deliveryState = 'ACKED'
          job.lastDeliveryError = null
          return
        } catch (error) {
          if (job.fencingToken !== snapshot.fencingToken) return
          job.lastDeliveryError = error
          if (error?.retryable === false) {
            job.deliveryState = 'DELIVERY_CONFLICT'
            return
          }
        }
      }
    })().finally(() => {
      job.deliveryPromise = null
      if (!job.acked && job.fencingToken !== snapshot.fencingToken) beginDelivery(job)
    })
  }

  const freezeTerminal = (job, terminal) => {
    if (jobs.get(job.idempotencyKey) !== job) return
    if (job.terminal) {
      if (canonical(job.terminal) !== canonical(terminal)) {
        throw new Error('STAGE12_LRA_FEASIBILITY_TERMINAL_CONFLICT')
      }
      return
    }
    job.terminal = immutableJson(terminal)
    job.terminalReceiptSha256 = hash(job.terminal.result
      ?? { errorCode: job.terminal.errorCode })
    job.status = 'READY'
    beginDelivery(job)
  }

  const createGeneration = (payload, durability, executionCount) => ({
    idempotencyKey: payload.idempotencyKey,
    requestSha256: durability.requestSha256,
    fencingToken: durability.fencingToken,
    leaseId: durability.leaseId,
    callback: immutableJson(payload.callback),
    status: 'PENDING',
    deliveryState: 'RUNNING',
    terminal: null,
    terminalReceiptSha256: null,
    deliveryPromise: null,
    acked: false,
    executionCount,
    heartbeatSequence: 0,
    heartbeatTimer: null,
    heartbeatPromise: null,
    leaseExpiresAt: null,
    lastHeartbeatError: null,
  })

  const launchGeneration = (job, payload) => {
    beginHeartbeat(job)
    job.executionPromise = Promise.resolve().then(() => input.execute(payload)).then(
      async (result) => {
        await stopHeartbeat(job)
        freezeTerminal(job, { result })
      },
      async (error) => {
        await stopHeartbeat(job)
        const result = error?.feasibilityResult
        freezeTerminal(job, result ? { result } : {
          errorCode: input.errorCode ? input.errorCode(error)
            : String(error?.code ?? 'STAGE12_CODEC_SAFE_LRA_FEASIBILITY_FAILED'),
        })
      },
    )
  }

  const receipt = (job) => ({ accepted: true, jobStatus: job.status,
    requestSha256: job.requestSha256, fencingToken: job.fencingToken,
    leaseId: job.leaseId,
    terminalReceiptSha256: job.terminalReceiptSha256 ?? null })

  const startExclusive = async (payload, durability) => {
    const existing = jobs.get(payload.idempotencyKey)
    if (existing) {
      if (existing.requestSha256 !== durability.requestSha256) {
        throw new Error('STAGE12_LRA_FEASIBILITY_IDEMPOTENCY_CONFLICT')
      }
      if (durability.fencingToken < existing.fencingToken) {
        throw new Error('STAGE12_LRA_FEASIBILITY_STALE_FENCE')
      }
      if (durability.fencingToken === existing.fencingToken
        && durability.leaseId !== existing.leaseId) {
        throw new Error('STAGE12_LRA_FEASIBILITY_FENCE_CONFLICT')
      }
      if (durability.fencingToken > existing.fencingToken) {
        if (!existing.terminal) {
          await stopHeartbeat(existing)
          const next = createGeneration(payload, durability, existing.executionCount + 1)
          jobs.set(payload.idempotencyKey, next)
          launchGeneration(next, payload)
          return receipt(next)
        }
        existing.fencingToken = durability.fencingToken
        existing.leaseId = durability.leaseId
        existing.callback = immutableJson(payload.callback)
        existing.acked = false
        existing.deliveryState = existing.terminal
          ? 'TERMINAL_PENDING_CALLBACK' : 'RUNNING'
        existing.lastDeliveryError = null
      } else {
        existing.callback = immutableJson(payload.callback)
      }
      if (!existing.terminal) beginHeartbeat(existing)
      beginDelivery(existing)
      return receipt(existing)
    }

    const job = createGeneration(payload, durability, 1)
    jobs.set(payload.idempotencyKey, job)
    launchGeneration(job, payload)
    return receipt(job)
  }

  const start = async (payload) => {
    const durability = validateDurability(payload)
    const idempotencyKey = payload.idempotencyKey
    const previous = startTransitions.get(idempotencyKey)
    let release
    const current = new Promise((resolve) => { release = resolve })
    startTransitions.set(idempotencyKey, current)
    if (previous) await previous
    try {
      return await startExclusive(payload, durability)
    } finally {
      release()
      if (startTransitions.get(idempotencyKey) === current) {
        startTransitions.delete(idempotencyKey)
      }
    }
  }

  const status = (idempotencyKey, requestSha256, fencingToken, leaseId) => {
    if (!/^[a-f0-9]{64}$/u.test(idempotencyKey ?? '')
      || !/^[a-f0-9]{64}$/u.test(requestSha256 ?? '')
      || !Number.isSafeInteger(fencingToken) || fencingToken < 1
      || !/^[A-Za-z0-9_-]{1,160}$/u.test(leaseId ?? '')) {
      throw new Error('INVALID_STAGE12_LRA_FEASIBILITY_STATUS_REQUEST')
    }
    const job = jobs.get(idempotencyKey)
    if (!job) return { state: 'NOT_FOUND', requestSha256, fencingToken, leaseId }
    if (job.requestSha256 !== requestSha256) {
      throw new Error('STAGE12_LRA_FEASIBILITY_IDEMPOTENCY_CONFLICT')
    }
    if (fencingToken !== job.fencingToken) {
      throw new Error(fencingToken < job.fencingToken
        ? 'STAGE12_LRA_FEASIBILITY_STALE_FENCE'
        : 'STAGE12_LRA_FEASIBILITY_FENCE_CONFLICT')
    }
    if (leaseId !== job.leaseId) {
      throw new Error('STAGE12_LRA_FEASIBILITY_FENCE_CONFLICT')
    }
    return { state: job.acked ? 'ACKED' : job.terminal
      ? 'TERMINAL_PENDING_CALLBACK' : 'RUNNING',
    requestSha256: job.requestSha256, fencingToken: job.fencingToken,
    leaseId: job.leaseId,
    terminalReceiptSha256: job.terminalReceiptSha256,
    deliveryState: job.deliveryState,
    deliveryErrorCode: job.lastDeliveryError
      ? String(job.lastDeliveryError.code ?? job.lastDeliveryError.message) : null,
    heartbeatSequence: job.heartbeatSequence,
    leaseExpiresAt: job.leaseExpiresAt,
    heartbeatErrorCode: job.lastHeartbeatError
      ? String(job.lastHeartbeatError.code ?? job.lastHeartbeatError.message) : null,
    ...(job.terminal?.result !== undefined ? { result: job.terminal.result }
      : job.terminal?.errorCode ? { errorCode: job.terminal.errorCode } : {}),
    executionCount: job.executionCount }
  }

  const redrive = async (idempotencyKey, requestSha256) => {
    const job = jobs.get(idempotencyKey)
    if (!job || job.requestSha256 !== requestSha256) {
      throw new Error('STAGE12_LRA_FEASIBILITY_IDEMPOTENCY_CONFLICT')
    }
    if (job.deliveryState === 'DELIVERY_CONFLICT') {
      throw new Error('STAGE12_LRA_FEASIBILITY_CALLBACK_ACK_CONFLICT')
    }
    if (job.deliveryPromise) await job.deliveryPromise
    beginDelivery(job)
    if (job.deliveryPromise) await job.deliveryPromise
  }

  const waitForIdle = async (idempotencyKey) => {
    while (true) {
      const transition = startTransitions.get(idempotencyKey)
      if (transition) await transition
      const job = jobs.get(idempotencyKey)
      if (!job) return
      await job.executionPromise
      while (job.deliveryPromise) await job.deliveryPromise
      if (jobs.get(idempotencyKey) === job) return
    }
  }

  return { start, status, redrive, waitForIdle }
}

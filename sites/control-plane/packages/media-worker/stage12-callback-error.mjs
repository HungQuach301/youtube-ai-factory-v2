const SAFE_ERROR_CODE = /^[A-Z0-9_:.-]{1,160}$/u
const TYPED_ERROR_CODE = /^[A-Z][A-Z0-9_:.-]{0,159}$/u
const QA_FAILURE_PREFIX = 'TRACK_G_STAGE_12_QA_FAILED:'

export function stage12CallbackErrorCode(candidate, status) {
  if (typeof candidate === 'string' && candidate.startsWith(QA_FAILURE_PREFIX)) {
    const failures = candidate.slice(QA_FAILURE_PREFIX.length).split(',')
    const compact = `S12QA:${failures.join('.')}`
    if (failures.length > 0
      && failures.every((failure) => /^[A-Z0-9_]+$/u.test(failure))
      && SAFE_ERROR_CODE.test(compact)) {
      return compact
    }
  }
  if (typeof candidate === 'string' && TYPED_ERROR_CODE.test(candidate)) return candidate
  return `STAGE12_CALLBACK_FAILED:${status}`
}

export function stage12WorkerErrorCode(error) {
  const candidate = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'STAGE12_FAILED'
  return TYPED_ERROR_CODE.test(candidate) ? candidate : 'STAGE12_FAILED'
}

export function stage12CallbackTransportErrorCode(error) {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String(error.name)
    : ''
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
  return name === 'TimeoutError' || name === 'AbortError' || code === '23'
    ? 'STAGE12_CALLBACK_TIMEOUT'
    : 'STAGE12_CALLBACK_TRANSPORT_FAILED'
}

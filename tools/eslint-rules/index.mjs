import g1 from './g1-no-json-stringify-hash.mjs'
import g2 from './g2-provider-sdk-boundary.mjs'
import g6 from './g6-no-provider-in-preflight.mjs'

export default {
  rules: {
    'g1-no-json-stringify-hash': g1,
    'g2-provider-sdk-boundary': g2,
    'g6-no-provider-in-preflight': g6
  }
}

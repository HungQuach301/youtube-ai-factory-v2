function calleePath(node) {
  if (!node) return ''
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') {
    const object = calleePath(node.object)
    const property = node.computed
      ? node.property.type === 'Literal' ? String(node.property.value) : ''
      : calleePath(node.property)
    return `${object}.${property}`
  }
  if (node.type === 'CallExpression') return calleePath(node.callee)
  return ''
}

function isJsonStringify(node) {
  return node?.type === 'CallExpression' && calleePath(node.callee) === 'JSON.stringify'
}

function containsJsonStringify(node) {
  if (!node || typeof node !== 'object') return false
  if (isJsonStringify(node)) return true
  return Object.entries(node).some(([key, value]) => {
    if (key === 'parent') return false
    if (Array.isArray(value)) return value.some(containsJsonStringify)
    return containsJsonStringify(value)
  })
}

function isHashingCall(node) {
  const path = calleePath(node.callee)
  return /(?:hash|digest|sha(?:256)?)/iu.test(path)
    || (path.endsWith('.update') && /createHash/iu.test(calleePath(node.callee.object)))
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'G1: require canonical serialization before hashing' },
    schema: [],
    messages: {
      nonCanonicalHash: 'G1: JSON.stringify is not canonical. Hash the original value through canonicalHash().'
    }
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isHashingCall(node) && node.arguments.some(containsJsonStringify)) {
          context.report({ node, messageId: 'nonCanonicalHash' })
        }
      }
    }
  }
}

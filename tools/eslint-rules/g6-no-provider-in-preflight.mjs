function calleePath(node) {
  if (!node) return ''
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return `${calleePath(node.object)}.${calleePath(node.property)}`
  if (node.type === 'CallExpression') return calleePath(node.callee)
  return ''
}

function functionName(node) {
  if (node?.type === 'MethodDefinition' || node?.type === 'PropertyDefinition' || node?.type === 'Property') {
    return node.key?.type === 'Identifier' ? node.key.name : ''
  }
  if (node?.type === 'FunctionDeclaration') return node.id?.name ?? ''
  return ''
}

const PROVIDER_CALL = /(?:^|\.)(?:provider|llm|openai|anthropic|dispatch|generateText|generateObject|chat|completions|responses)(?:\.|$)/iu

export default {
  meta: {
    type: 'problem',
    docs: { description: 'G6: preflight must remain deterministic and provider-free' },
    schema: [],
    messages: {
      providerCall: 'G6: preflight() cannot call an LLM or provider. Use deterministic measurements only.'
    }
  },
  create(context) {
    const preflightRanges = []
    return {
      ':function'(node) {
        const name = functionName(node) || functionName(node.parent)
        if (name === 'preflight' && Array.isArray(node.range)) preflightRanges.push(node.range)
      },
      CallExpression(node) {
        if (!Array.isArray(node.range)) return
        const inside = preflightRanges.some(([start, end]) => start <= node.range[0] && node.range[1] <= end)
        if (inside && PROVIDER_CALL.test(calleePath(node.callee))) {
          context.report({ node, messageId: 'providerCall' })
        }
      },
      'Program:exit'() {
        preflightRanges.length = 0
      }
    }
  }
}

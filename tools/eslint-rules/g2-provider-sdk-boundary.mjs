const PROVIDER_SDK = /^(?:openai|@anthropic-ai\/sdk|@google\/generative-ai|elevenlabs|@elevenlabs\/|groq-sdk|cohere-ai|replicate|runway|pexels|pixabay|youtubei|googleapis)(?:\/|$)/u

function isAdapterFile(filename) {
  return filename.replaceAll('\\', '/').includes('/packages/provider/adapters/')
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'G2: provider SDK imports are restricted to provider adapters' },
    schema: [],
    messages: {
      sdkBoundary: 'G2: provider SDK "{{source}}" may only be imported from packages/provider/adapters/.'
    }
  },
  create(context) {
    if (isAdapterFile(context.filename)) return {}

    function check(node) {
      const source = node.source?.value
      if (typeof source === 'string' && PROVIDER_SDK.test(source)) {
        context.report({ node, messageId: 'sdkBoundary', data: { source } })
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check
    }
  }
}

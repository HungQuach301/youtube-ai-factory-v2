function normalizedFilename(filename) {
  return `/${filename.replaceAll('\\', '/').replace(/^\/+/, '')}`
}

function isProviderFramework(filename) {
  return normalizedFilename(filename).endsWith('/packages/provider/src/framework.js')
    || normalizedFilename(filename).endsWith('/packages/provider/src/framework.ts')
}

function isProviderAdapter(filename) {
  return normalizedFilename(filename).includes('/packages/provider/adapters/')
}

function isProviderPackage(filename) {
  return normalizedFilename(filename).includes('/packages/provider/')
}

function importsConcreteAdapter(source) {
  return /(?:^|\/)provider\/adapters\//u.test(source)
}

function exportedName(specifier) {
  const exported = specifier.exported
  if (exported?.type === 'Identifier') return exported.name
  if (exported?.type === 'Literal') return exported.value
  return null
}

function isDispatchMember(member) {
  if (member?.type !== 'MemberExpression') return false
  if (!member.computed) {
    return member.property?.type === 'Identifier' && member.property.name === 'dispatch'
  }
  return member.property?.type === 'Literal' && member.property.value === 'dispatch'
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'G9: provider transport is reachable only through guardedDispatch' },
    schema: [],
    messages: {
      directDispatch: 'G9: direct provider dispatch is forbidden; use guardedDispatch().',
      adapterImport: 'G9: concrete provider adapters cannot be imported outside the provider package.',
      dispatchExport: 'G9: adapters cannot export a raw dispatch function.',
    },
  },
  create(context) {
    const filename = context.filename

    return {
      ImportDeclaration(node) {
        const source = node.source?.value
        if (!isProviderPackage(filename)
          && typeof source === 'string'
          && importsConcreteAdapter(source)) {
          context.report({ node, messageId: 'adapterImport' })
        }
      },
      CallExpression(node) {
        const callee = node.callee
        if (!isProviderFramework(filename)
          && !isProviderAdapter(filename)
          && isDispatchMember(callee)) {
          context.report({ node, messageId: 'directDispatch' })
        }
      },
      ExportNamedDeclaration(node) {
        if (!isProviderAdapter(filename)) return
        const declaration = node.declaration
        const functionName = declaration?.type === 'FunctionDeclaration' ? declaration.id?.name : null
        const variableExports = declaration?.type === 'VariableDeclaration'
          ? declaration.declarations.some((item) => item.id.type === 'Identifier' && item.id.name === 'dispatch')
          : false
        const specifierExport = node.specifiers.some((specifier) => exportedName(specifier) === 'dispatch')
        if (functionName === 'dispatch' || variableExports || specifierExport) {
          context.report({ node, messageId: 'dispatchExport' })
        }
      },
      ExportDefaultDeclaration(node) {
        if (!isProviderAdapter(filename)) return
        const declaration = node.declaration
        if ((declaration.type === 'Identifier' && declaration.name === 'dispatch')
          || (declaration.type === 'FunctionDeclaration' && declaration.id?.name === 'dispatch')) {
          context.report({ node, messageId: 'dispatchExport' })
        }
      },
    }
  },
}

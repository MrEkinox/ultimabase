import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlYogaPluginPublicApi,
	removedGraphqlYogaPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'public-api-language-service.fixture.ts',
)
const moduleSpecifier = '../src/index.js'

describe('@ultimabase/graphql-yoga-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const marker = '/* exports */'
		const source = `import { ${marker} } from '${moduleSpecifier}'`
		const service = createLanguageService(fixtureFile, source)
		const completions =
			service
				.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? []
		const expected = getOptionalProductPublicApiNames(
			graphqlYogaPluginPublicApi,
		)

		expect(new Set(expected).size).toBe(expected.length)
		expect(completions).toStrictEqual(expected)
	})

	it('keeps protocol implementation details private', () => {
		const source = `import { ${removedGraphqlYogaPluginPublicApiNames.join(', ')} } from '${moduleSpecifier}'`
		const messages = createLanguageService(fixtureFile, source)
			.getSemanticDiagnostics(fixtureFile)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, ' '),
			)

		expect(messages).toHaveLength(removedGraphqlYogaPluginPublicApiNames.length)
		for (const name of removedGraphqlYogaPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})

	it('documents the factory and each accepted option in editor hovers', () => {
		const source = `
import { graphqlYogaPlugin, type GraphqlYogaPluginOptions } from '${moduleSpecifier}'
const options: GraphqlYogaPluginOptions = {
  bodyLimit: 1024,
  introspection: true,
  path: '/graphql',
}
graphqlYogaPlugin(options)
`
		const service = createLanguageService(fixtureFile, source)
		const documentationAt = (needle: string): string =>
			service
				.getQuickInfoAtPosition(fixtureFile, source.lastIndexOf(needle))
				?.documentation?.map(({ text }) => text)
				.join('') ?? ''

		expect(documentationAt('graphqlYogaPlugin')).toContain(
			'Mounts one explicit GraphQL sibling',
		)
		expect(documentationAt('bodyLimit')).toContain('streamed JSON')
		expect(documentationAt('introspection')).toContain('schema introspection')
		expect(documentationAt('path')).toContain('mount path')
	})
})

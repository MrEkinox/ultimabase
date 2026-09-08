import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphiqlPluginPublicApi,
	removedGraphiqlPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(import.meta.dirname, 'public-api.fixture.ts')
const moduleSpecifier = '../src/index.js'

describe('@ultimabase/graphiql-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const marker = '/* exports */'
		const source = `import { ${marker} } from '${moduleSpecifier}'`
		const completions =
			createLanguageService(fixtureFile, source)
				.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? []
		expect(completions).toStrictEqual(
			getOptionalProductPublicApiNames(graphiqlPluginPublicApi),
		)
	})

	it('keeps page and normalization details private', () => {
		const source = `import { ${removedGraphiqlPluginPublicApiNames.join(', ')} } from '${moduleSpecifier}'`
		const messages = createLanguageService(fixtureFile, source)
			.getSemanticDiagnostics(fixtureFile)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, ' '),
			)
		expect(messages).toHaveLength(removedGraphiqlPluginPublicApiNames.length)
	})

	it('documents the factory and every option in editor hovers', () => {
		const source = `
import { graphiqlPlugin, type GraphiqlPluginOptions } from '${moduleSpecifier}'
const options: GraphiqlPluginOptions = { environment: 'production', allowInProduction: true, path: '/ide' }
graphiqlPlugin(options)
`
		const service = createLanguageService(fixtureFile, source)
		const documentationAt = (needle: string): string =>
			service
				.getQuickInfoAtPosition(fixtureFile, source.lastIndexOf(needle))
				?.documentation?.map(({ text }) => text)
				.join('') ?? ''
		expect(documentationAt('graphiqlPlugin')).toContain('GraphiQL page')
		expect(documentationAt('environment')).toContain('deployment environment')
		expect(documentationAt('allowInProduction')).toContain('permits the route')
		expect(documentationAt('path')).toContain('route suffix')
	})
})

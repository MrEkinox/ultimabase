import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	graphqlPluginPublicApi,
	removedGraphqlPluginPublicApiNames,
} from '../../../tooling/vitest/optional-product-public-api.js'
import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'public-api-language-service.fixture.ts',
)
const moduleSpecifier = '../src/index.js'

const readExportCompletions = (): readonly string[] => {
	const marker = '/* exports */'
	const source = `import { ${marker} } from '${moduleSpecifier}'`
	const service = createLanguageService(fixtureFile, source)

	return (
		service
			.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
			?.entries.map(({ name }) => name)
			.filter((name) => name !== 'type')
			.sort() ?? []
	)
}

describe('@ultimabase/graphql-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(graphqlPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(readExportCompletions()).toStrictEqual(expected)
	})

	it('keeps structural compiler details private', () => {
		const source = `import { ${removedGraphqlPluginPublicApiNames.join(', ')} } from '${moduleSpecifier}'`
		const messages = createLanguageService(fixtureFile, source)
			.getSemanticDiagnostics(fixtureFile)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, ' '),
			)

		expect(messages).toHaveLength(removedGraphqlPluginPublicApiNames.length)
		for (const name of removedGraphqlPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})

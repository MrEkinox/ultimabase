import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	accessPluginPublicApi,
	getOptionalProductPublicApiNames,
	removedAccessPluginPublicApiNames,
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

describe('@ultimabase/access-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(accessPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(readExportCompletions()).toStrictEqual(expected)
	})

	it('rejects removed implementation details at the root', () => {
		const source = `import { ${removedAccessPluginPublicApiNames.join(', ')} } from '${moduleSpecifier}'`
		const diagnostics = createLanguageService(
			fixtureFile,
			source,
		).getSemanticDiagnostics(fixtureFile)
		const messages = diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, ' '),
		)

		expect(messages).toHaveLength(removedAccessPluginPublicApiNames.length)
		for (const name of removedAccessPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})

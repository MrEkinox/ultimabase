import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	getOptionalProductPublicApiNames,
	hooksPluginPublicApi,
	removedHooksPluginPublicApiNames,
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

describe('@ultimabase/hooks-plugin source declarations', () => {
	it('classifies the complete deliberate root surface', () => {
		const expected = getOptionalProductPublicApiNames(hooksPluginPublicApi)

		expect(new Set(expected).size).toBe(expected.length)
		expect(readExportCompletions()).toStrictEqual(expected)
	})

	it('rejects removed implementation details at the root', () => {
		const source = `import { ${removedHooksPluginPublicApiNames.join(', ')} } from '${moduleSpecifier}'`
		const diagnostics = createLanguageService(
			fixtureFile,
			source,
		).getSemanticDiagnostics(fixtureFile)
		const messages = diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, ' '),
		)

		expect(messages).toHaveLength(removedHooksPluginPublicApiNames.length)
		for (const name of removedHooksPluginPublicApiNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})

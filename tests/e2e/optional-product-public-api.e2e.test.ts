import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	accessPluginPublicApi,
	getOptionalProductPublicApiNames,
	hooksPluginPublicApi,
	removedAccessPluginPublicApiNames,
	removedHooksPluginPublicApiNames,
	type OptionalProductPublicApi,
} from '../../tooling/vitest/optional-product-public-api.js'
import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

interface OptionalProductFixture {
	readonly classification: OptionalProductPublicApi
	readonly moduleSpecifier:
		'@ultimabase/access-plugin' | '@ultimabase/hooks-plugin'
	readonly removedNames: readonly string[]
}

const fixtures: readonly OptionalProductFixture[] = [
	{
		classification: accessPluginPublicApi,
		moduleSpecifier: '@ultimabase/access-plugin',
		removedNames: removedAccessPluginPublicApiNames,
	},
	{
		classification: hooksPluginPublicApi,
		moduleSpecifier: '@ultimabase/hooks-plugin',
		removedNames: removedHooksPluginPublicApiNames,
	},
]

describe.each(fixtures)('$moduleSpecifier packed public API', (fixture) => {
	const fixtureFile = path.join(
		import.meta.dirname,
		`${fixture.moduleSpecifier.slice('@ultimabase/'.length)}.packed.fixture.ts`,
	)

	it('exposes every classified root contract through the package archive', () => {
		const marker = '/* exports */'
		const source = `import { ${marker} } from '${fixture.moduleSpecifier}'`
		const service = createLanguageService(fixtureFile, source)
		const completions =
			service
				.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? []

		expect(completions).toStrictEqual(
			getOptionalProductPublicApiNames(fixture.classification),
		)
	})

	it('keeps removed implementation details unavailable from the root', () => {
		const source = `import { ${fixture.removedNames.join(', ')} } from '${fixture.moduleSpecifier}'`
		const diagnostics = createLanguageService(
			fixtureFile,
			source,
		).getSemanticDiagnostics(fixtureFile)
		const messages = diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, ' '),
		)

		expect(messages).toHaveLength(fixture.removedNames.length)
		for (const name of fixture.removedNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})

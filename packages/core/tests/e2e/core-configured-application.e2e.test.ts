import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/runtime/configured-application-language-service.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-configured-application.packed.fixture.ts',
)

describe('packed configured UltimaBase application factories', () => {
	it('keeps construction concise, documented, and free of a second plugin input', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
		expect(
			languageFixture
				.readMemberCompletions('options')
				.map(({ name }) => name)
				.sort(),
		).toStrictEqual(['masterAuthority', 'pluginPrivileges', 'validation'])
		const lifecycle = languageFixture
			.readMemberCompletions('lifecycle')
			.map(({ name }) => name)
		expect(lifecycle).toEqual(
			expect.arrayContaining([
				'compile',
				'dispose',
				'initialize',
				'plugin',
				'start',
				'stop',
			]),
		)

		const use = languageFixture.readHover('use')
		expect(use.display).toContain('.use<')
		expect(use.documentation).toContain('new immutable factory')
		expect(use.display.length).toBeLessThan(2_000)
		const append = languageFixture.readHover('append')
		expect(append.display).toContain('ConfiguredUltimaBaseFactory')
		expect(append.documentation).toContain('new factory')
		const factory = languageFixture.readHover('factory')
		expect(factory.display).toContain('ConfiguredUltimaBaseFactory')
		expect(factory.display.length).toBeLessThan(2_000)
		const schema = languageFixture.readHover('schema')
		expect(schema.display).toContain('Schema')
		expect(schema.documentation).toContain('same schema namespace')
		const pluginExports = languageFixture.readHover('plugin')
		expect(pluginExports.display).toContain('dialect: "fixture"')
		expect(pluginExports.display.length).toBeLessThan(2_000)
	})
})

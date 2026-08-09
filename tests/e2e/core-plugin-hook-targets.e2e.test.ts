import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/plugin-hook-targets.fixture.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-plugin-hook-targets.packed.fixture.ts',
)
const readHoverDisplay = (name: string): string =>
	languageFixture.readHover(name).display

describe('packed @ultimabase/core plugin hook targets', () => {
	it('type-checks through public package declarations', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('preserves every target method and exact field-path completion', () => {
		expect(
			languageFixture
				.readMemberCompletions('hook-target-methods')
				.map(({ name }) => name)
				.sort(),
		).toStrictEqual([
			'field',
			'fieldExtension',
			'fieldKind',
			'global',
			'schema',
			'schemaExtension',
		])

		const rootNames = languageFixture.readStringCompletions('root-field-path')
		const nestedNames =
			languageFixture.readStringCompletions('nested-field-path')

		expect(rootNames).toEqual(
			expect.arrayContaining(['endpoint', 'id', 'profile', 'tags', 'title']),
		)
		expect(nestedNames).toContain('displayName')
		expect(nestedNames).not.toContain('title')
	})

	it('keeps exact values and concise public aliases after declaration emission', () => {
		expect(readHoverDisplay('schema-title')).toContain('string')
		expect(readHoverDisplay('listed-value')).toContain(
			'readonly string[] | null',
		)
		expect(readHoverDisplay('object-value')).toContain(
			'displayName?: string | null;',
		)
		expect(readHoverDisplay('custom-value')).toContain('URL')
		expect(readHoverDisplay('kind-value')).toContain('URL')
		expect(readHoverDisplay('schema-extension-config')).toContain('"strict"')
		expect(readHoverDisplay('field-extension-config')).toContain('true')

		const registry = readHoverDisplay('hook-registry')
		const kindTarget = readHoverDisplay('kind-target')

		expect(registry).toContain('PluginHookRegistry')
		expect(registry).not.toContain('SchemaDefinition<')
		expect(kindTarget).toContain('FieldKindHookTarget<')
		expect(kindTarget).not.toContain('FieldHooks<')
	})
})

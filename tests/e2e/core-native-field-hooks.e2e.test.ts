import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/native-field-hooks.fixture.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-native-field-hooks.packed.fixture.ts',
)
const readHoverDisplay = (name: string): string =>
	languageFixture.readHover(name).display
const readMemberCompletionNames = (name: string): readonly string[] =>
	languageFixture
		.readMemberCompletions(name)
		.map(({ name: entryName }) => entryName)
		.sort()

describe('packed @ultimabase/core native field hooks', () => {
	it('type-checks through public package declarations', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('preserves documented inline phase completion', () => {
		const resolveInput = languageFixture
			.readMemberCompletions('field-hooks')
			.find(({ name }) => name === 'resolveInput')

		if (resolveInput === undefined) {
			throw new TypeError('Missing packed resolveInput completion')
		}

		expect(resolveInput.documentation.trim()).not.toBe('')
		expect(resolveInput.hasExample).toBe(true)
	})

	it('keeps exact values and compact field hovers after declaration emission', () => {
		expect(readHoverDisplay('input-value')).toContain('string | null')
		const fieldDisplay = readHoverDisplay('field-definition')

		expect(fieldDisplay).toContain(
			'NonDefaultedStringField<false, false, false>',
		)
		expect(fieldDisplay).not.toContain('FieldHooks')
		expect(fieldDisplay).not.toContain('HOOK_BODY_MUST_NOT_LEAK')
	})

	it('preserves field family composition and concise aliases after emission', () => {
		expect(readMemberCompletionNames('field-save-families')).toStrictEqual([
			'all',
			'create',
			'update',
			'upsert',
		])
		expect(readHoverDisplay('field-create-family-kind')).toContain('"create"')
		const display = readHoverDisplay('field-family-declaration')

		expect(display).toContain('FieldResolveInputHookDeclaration<')
		expect(display).not.toContain('FieldValueHookInput<')
		expect(display).not.toContain('HookHandlerDeclaration<')
	})
})

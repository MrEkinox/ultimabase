import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/native-schema-hooks.fixture.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-native-schema-hooks.packed.fixture.ts',
)
const readHoverDisplay = (name: string): string =>
	languageFixture.readHover(name).display
const readMemberCompletionNames = (name: string): readonly string[] =>
	languageFixture
		.readMemberCompletions(name)
		.map(({ name: entryName }) => entryName)
		.sort()

describe('packed @ultimabase/core native schema hooks', () => {
	it('type-checks through public package declarations', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('preserves phase completion documentation', () => {
		const beforeOperation = languageFixture
			.readMemberCompletions('schema-hooks')
			.find(({ name }) => name === 'beforeOperation')

		if (beforeOperation === undefined) {
			throw new TypeError('Missing packed beforeOperation completion')
		}

		expect(beforeOperation.documentation.trim()).not.toBe('')
		expect(beforeOperation.hasExample).toBe(true)
	})

	it('keeps callback values precise and compact after declaration emission', () => {
		const createInput = readHoverDisplay('create-input')

		expect(createInput).toContain('title: string;')
		expect(createInput).not.toContain('SchemaDefinition<')
		expect(createInput).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
		expect(readHoverDisplay('create-item')).toContain(
			'readonly [x: string]: unknown;',
		)
		expect(readHoverDisplay('create-item')).toContain('toString(): string;')
	})

	it('preserves family composition and concise aliases after emission', () => {
		expect(readMemberCompletionNames('schema-save-families')).toStrictEqual([
			'all',
			'create',
			'update',
			'upsert',
		])
		expect(readHoverDisplay('create-family-kind')).toContain('"create-one"')
		expect(readHoverDisplay('before-create-kind')).toContain('"create"')
		expect(readHoverDisplay('before-delete-kind')).toContain('"delete"')
		const display = readHoverDisplay('schema-family-declaration')

		expect(display).toContain('SchemaBeforeOperationHooks<')
		expect(display).not.toContain('ExecutableOperationAst<')
	})
})

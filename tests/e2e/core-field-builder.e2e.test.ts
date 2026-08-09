import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/field-builder.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-field-builder.packed.fixture.ts',
)
const rootMethods = [
	'add',
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'pointer',
	'relation',
	'string',
	'time',
	'uuid',
] as const

describe('packed @ultimabase/core FieldBuilder contract', () => {
	it('type-checks the canonical declaration through package exports', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('preserves documented root and embedded completions', () => {
		const root = languageFixture.readMemberCompletions('root-builder')

		expect(root.map(({ name }) => name).sort()).toStrictEqual(rootMethods)
		for (const completion of root) {
			expect(completion.documentation.trim(), completion.name).not.toBe('')
			expect(completion.hasExample, completion.name).toBe(true)
		}

		const nested = languageFixture.readMemberCompletions('nested-builder')

		expect(nested.map(({ name }) => name).sort()).toStrictEqual(
			rootMethods.filter((name) => name !== 'pointer' && name !== 'relation'),
		)
	})

	it('retains the concise method signature and existing option help', () => {
		const hover = languageFixture.readHover('string-builder')

		expect(hover.display).toContain('name: string')
		expect(hover.display).toContain('StringFieldOptions')
		expect(hover.documentation.trim()).not.toBe('')
		expect(hover.hasExample).toBe(true)
		expect(
			languageFixture.readSignatureParameterDocumentation('string-name', 0),
		).toContain('Stable logical field name')
		expect(
			languageFixture
				.readMemberCompletions('string-options')
				.map(({ name }) => name),
		).toContain('validation')
	})
})

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

	it('preserves root and embedded completions', () => {
		const root = languageFixture.readMemberCompletions('root-builder')

		expect(root.map(({ name }) => name).sort()).toStrictEqual(rootMethods)

		const nested = languageFixture.readMemberCompletions('nested-builder')

		expect(nested.map(({ name }) => name).sort()).toStrictEqual(
			rootMethods.filter((name) => name !== 'pointer' && name !== 'relation'),
		)
	})

	it('retains the concise method signature and existing option help', () => {
		const hover = languageFixture.readHover('string-builder')

		expect(hover.display).toContain('StringFieldOptions')
		expect(
			languageFixture
				.readMemberCompletions('string-options')
				.map(({ name }) => name),
		).toContain('validation')
	})
})

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
	`
declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedRegistryState {
		readonly application: true
	}
	interface UltimaBaseGeneratedSchemas {
		readonly PackedFieldBuilder: import('@ultimabase/core').BaseSchemaTypeInfo<'PackedFieldBuilder'>
		readonly PackedValidatorTarget: import('@ultimabase/core').BaseSchemaTypeInfo<'PackedValidatorTarget'>
	}
}
`,
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

	it('exposes direct documented decimal shape options', () => {
		expect(
			languageFixture
				.readMemberCompletions('decimal-options')
				.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['precision', 'scale', 'validation']))

		const precision = languageFixture.readHover('decimal-precision')
		const scale = languageFixture.readHover('decimal-scale')

		expect(precision.display).toContain('precision?: number')
		expect(precision.documentation).toContain('total number')
		expect(precision.hasExample).toBe(true)
		expect(scale.display).toContain('scale?: number')
		expect(scale.documentation).toContain('digits after the decimal')
		expect(scale.hasExample).toBe(true)
	})

	it('retains documented direct presence beside real validators', () => {
		const required = languageFixture.readHover('field-required')

		expect(required.display).toContain('required?: true')
		expect(required.documentation).toContain('non-null persisted')
		expect(required.hasExample).toBe(true)
	})

	it('offers every pointer referential action', () => {
		expect(
			[...languageFixture.readStringCompletions('pointer-on-delete')].sort(),
		).toStrictEqual(['cascade', 'restrict', 'setNull'])
	})
})

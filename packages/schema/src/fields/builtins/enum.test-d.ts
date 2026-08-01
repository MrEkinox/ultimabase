import { expectTypeOf, test } from 'vitest'

import {
	defineSchemaExtension,
	enumField,
	type EnumField,
	type EnumFieldOptions,
	type EnumValue,
	type FieldDefinition,
} from '../../index.js'

enum NativeStatus {
	Draft = 'draft',
	Published = 'published',
}

enum NumericStatus {
	Draft,
	Published,
}

test('infers a literal union from an inline list without as const', () => {
	const field = enumField({
		typeName: 'PublicationStatus',
		values: ['draft', 'published', 'archived'],
		validation: {
			required: true,
		},
		default: 'draft',
		indexed: true,
	})

	// The field value is the exact union of persisted list values.
	expectTypeOf(field).toExtend<
		FieldDefinition<'enum', 'draft' | 'published' | 'archived'>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'enum'>()
	expectTypeOf(field.options.typeName).toEqualTypeOf<'PublicationStatus'>()
	expectTypeOf(field.options.values).toEqualTypeOf<
		readonly ['draft', 'published', 'archived']
	>()
	expectTypeOf(field.options.default).toEqualTypeOf<'draft'>()
})

test('infers persisted values from a symbolic mapping', () => {
	const field = enumField({
		values: {
			Draft: 'draft',
			Published: 'published',
		},
		default: 'published',
	})

	expectTypeOf(field).toExtend<FieldDefinition<'enum', 'draft' | 'published'>>()
	expectTypeOf(field.options.values.Draft).toEqualTypeOf<'draft'>()
	expectTypeOf(field.options.default).toEqualTypeOf<'published'>()
})

test('accepts native string enums without numeric reverse mappings', () => {
	const field = enumField({
		values: NativeStatus,
		default: NativeStatus.Draft,
	})

	expectTypeOf(field).toExtend<FieldDefinition<'enum', NativeStatus>>()
	expectTypeOf(field.options.default).toEqualTypeOf<NativeStatus.Draft>()
})

test('rejects invalid enum sources and metadata', () => {
	// @ts-expect-error -- Inline enum lists cannot be empty.
	enumField({ values: [] })
	// @ts-expect-error -- Symbolic enum mappings cannot be empty.
	enumField({ values: {} })
	// @ts-expect-error -- Numeric enums expose numbers and reverse mappings.
	enumField({ values: NumericStatus })
	// @ts-expect-error -- Defaults must belong to the inferred persisted union.
	enumField({ values: ['draft', 'published'], default: 'archived' })
	// @ts-expect-error -- Enum values must be strings.
	enumField({ values: ['draft', 1] })
	enumField({
		// @ts-expect-error -- Neutral type identities must use strings.
		typeName: 42,
		values: ['draft'],
	})
	// @ts-expect-error -- Required fields cannot also be nullable.
	enumField({
		values: ['draft'],
		validation: {
			required: true,
			nullable: true,
		},
	})
	enumField({
		values: ['draft'],
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.enum', {})],
	})

	expectTypeOf<EnumValue<readonly ['first', 'second']>>().toEqualTypeOf<
		'first' | 'second'
	>()
	expectTypeOf<EnumFieldOptions<readonly ['first', 'second']>>().toExtend<
		FieldDefinition<'enum', string>['options']
	>()
	expectTypeOf<EnumField>().toExtend<FieldDefinition<'enum', string>>()
})

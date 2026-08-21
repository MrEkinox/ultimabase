import { expectTypeOf, test } from 'vitest'

import {
	enumField,
	type EnumField,
	type EnumFieldOptions,
	type EnumValue,
	type FieldDefinition,
	type FieldTypegenState,
	type FieldTypegenStateOf,
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
		required: true,
		default: 'draft',
		indexed: true,
	})

	// The field value is the exact union of persisted list values.
	expectTypeOf(field).toExtend<
		FieldDefinition<
			'enum',
			'draft' | 'published' | 'archived',
			EnumFieldOptions<readonly ['draft', 'published', 'archived']>,
			FieldTypegenState
		>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'enum'>()
	expectTypeOf(field.options.values).toEqualTypeOf<
		readonly ['draft', 'published', 'archived']
	>()
	expectTypeOf<
		FieldTypegenStateOf<typeof field>['object']
	>().toEqualTypeOf<'required'>()
})

test('infers persisted values from a symbolic mapping', () => {
	const field = enumField({
		values: {
			Draft: 'draft',
			Published: 'published',
		},
		default: 'published',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<
			'enum',
			'draft' | 'published',
			EnumFieldOptions<
				Readonly<{ readonly Draft: 'draft'; readonly Published: 'published' }>
			>,
			FieldTypegenState
		>
	>()
	expectTypeOf(field.options.values.Draft).toEqualTypeOf<'draft'>()
})

test('accepts native string enums without numeric reverse mappings', () => {
	const field = enumField({
		values: NativeStatus,
		default: NativeStatus.Draft,
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<
			'enum',
			NativeStatus,
			EnumFieldOptions<typeof NativeStatus>,
			FieldTypegenState
		>
	>()
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
	enumField({
		values: ['draft'],
		required: true,
		// @ts-expect-error -- Validation must implement Standard Schema V1.
		validation: {
			nullable: true,
		},
	})
	enumField({
		values: ['draft'],
		// @ts-expect-error -- Removed generic extension metadata is not a field option.
		extensions: [],
	})

	expectTypeOf<EnumValue<readonly ['first', 'second']>>().toEqualTypeOf<
		'first' | 'second'
	>()
	expectTypeOf<EnumFieldOptions<readonly ['first', 'second']>>().toExtend<
		FieldDefinition<'enum', string>['options']
	>()
	expectTypeOf<EnumField>().toExtend<
		FieldDefinition<'enum', string, EnumFieldOptions, FieldTypegenState>
	>()
})

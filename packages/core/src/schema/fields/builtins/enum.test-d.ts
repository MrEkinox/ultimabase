import { expectTypeOf, test } from 'vitest'

import {
	defineEnum,
	enumField,
	type SharedEnum,
	type EnumField,
	type EnumFieldOptions,
	type EnumValue,
	type FieldDefinition,
	type FieldTypeState,
	type FieldTypeStateOf,
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
			FieldTypeState
		>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'enum'>()
	expectTypeOf(field.options.values).toEqualTypeOf<
		readonly ['draft', 'published', 'archived']
	>()
	expectTypeOf<
		FieldTypeStateOf<typeof field>['object']
	>().toEqualTypeOf<'required'>()
})

test('infers persisted values from a shared enum', () => {
	const Status = defineEnum('PublicationStatus', ['draft', 'published'])
	const field = enumField({ values: Status, default: 'published' })

	expectTypeOf(Status).toEqualTypeOf<
		SharedEnum<'PublicationStatus', readonly ['draft', 'published']>
	>()
	expectTypeOf(field).toExtend<
		FieldDefinition<
			'enum',
			'draft' | 'published',
			EnumFieldOptions<typeof Status>,
			FieldTypeState
		>
	>()
	expectTypeOf<EnumValue<typeof Status>>().toEqualTypeOf<
		'draft' | 'published'
	>()
	// @ts-expect-error -- Defaults belong to the shared values.
	enumField({ values: Status, default: 'archived' })
})

test('rejects invalid enum sources and metadata', () => {
	// @ts-expect-error -- Inline enum lists cannot be empty.
	enumField({ values: [] })
	// @ts-expect-error -- Mappings are removed (ADR-0310).
	enumField({ values: { Draft: 'draft' } })
	// @ts-expect-error -- TypeScript string enums are removed (ADR-0310).
	enumField({ values: NativeStatus })
	// @ts-expect-error -- Numeric enums expose numbers and reverse mappings.
	enumField({ values: NumericStatus })
	// @ts-expect-error -- Defaults must belong to the inferred persisted union.
	enumField({ values: ['draft', 'published'], default: 'archived' })
	// @ts-expect-error -- Enum values must be strings.
	enumField({ values: ['draft', 1] })
	enumField({
		// @ts-expect-error -- The typeName option is removed; use defineEnum (ADR-0310).
		typeName: 'Status',
		values: ['draft'],
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
		FieldDefinition<'enum', string, EnumFieldOptions, FieldTypeState>
	>()
})

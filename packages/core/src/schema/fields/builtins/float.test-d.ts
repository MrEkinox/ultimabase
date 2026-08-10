import { expectTypeOf, test } from 'vitest'

import {
	defineFieldExtension,
	defineSchemaExtension,
	floatField,
	type FieldDefinition,
	type FieldTypegenState,
	type FieldTypegenStateOf,
	type FloatField,
	type FloatFieldOptions,
	type FloatValidationOptions,
} from '../../index.js'

test('preserves float options and exact literals', () => {
	const extension = defineFieldExtension('fixture.unit', {
		name: 'meters',
	})
	const field = floatField({
		validation: {
			range: {
				min: -1.5,
				max: 4.25,
			},
			finite: false,
		},
		extensions: [extension],
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'float', number, FloatFieldOptions, FieldTypegenState>
	>()
	expectTypeOf(field).toExtend<FloatField>()
	expectTypeOf(field.kind).toEqualTypeOf<'float'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<FloatFieldOptions>>()
	expectTypeOf<FieldTypegenStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: true
		readonly list: false
	}>()
})

test('rejects incompatible float metadata', () => {
	// @ts-expect-error -- Database sequences cannot generate float fields.
	floatField({ autoIncrement: true })

	// @ts-expect-error -- Even disabled sequence metadata is integer-only.
	floatField({ autoIncrement: false })

	// @ts-expect-error -- Float defaults must use JavaScript numbers.
	floatField({ default: '0' })

	// @ts-expect-error -- The finite constraint must be boolean.
	floatField({ validation: { finite: 'yes' } })

	// @ts-expect-error -- Range boundaries must be JavaScript numbers.
	floatField({ validation: { range: { min: '0' } } })

	floatField({
		validation: {
			required: true,
			// @ts-expect-error -- Nullability is derived and cannot be configured.
			nullable: true,
		},
	})

	floatField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.unit', {})],
	})

	expectTypeOf<FloatFieldOptions>().toExtend<
		FieldDefinition<'float', number>['options']
	>()
	expectTypeOf<FloatValidationOptions>().toExtend<
		NonNullable<FloatFieldOptions['validation']>
	>()
})

import { expectTypeOf, test } from 'vitest'

import {
	defineSchemaExtension,
	intField,
	type FieldDefinition,
	type FieldTypegenState,
	type FieldTypegenStateOf,
	type IntField,
	type IntFieldOptions,
	type IntValidationOptions,
} from '../../index.js'

test('preserves integer options and exact literals', () => {
	const field = intField({
		validation: {
			required: true,
			range: {
				min: -10,
				max: 10,
			},
		},
		default: 0,
		immutable: true,
		indexed: 'unique',
		autoIncrement: true,
		description: 'Signed score',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'int', number, IntFieldOptions, FieldTypegenState>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'int'>()
	expectTypeOf(field.options).toExtend<Readonly<IntFieldOptions>>()
	expectTypeOf(field.options.autoIncrement).toEqualTypeOf<true>()
	expectTypeOf<FieldTypegenStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'forbidden'
		readonly nullable: false
		readonly list: false
	}>()
	expectTypeOf<IntField>().toExtend<
		FieldDefinition<'int', number, IntFieldOptions, FieldTypegenState>
	>()
})

test('rejects incompatible integer metadata', () => {
	// @ts-expect-error -- Integer fields do not expose float-only finite metadata.
	intField({ validation: { finite: true } })

	// @ts-expect-error -- Integer defaults must use JavaScript numbers.
	intField({ default: '0' })

	// @ts-expect-error -- Range boundaries must be JavaScript numbers.
	intField({ validation: { range: { min: '0' } } })

	intField({
		validation: {
			required: true,
			// @ts-expect-error -- Nullability is derived and cannot be configured.
			nullable: true,
		},
	})

	intField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.unit', {})],
	})

	expectTypeOf<IntFieldOptions>().toExtend<
		FieldDefinition<'int', number>['options']
	>()
	expectTypeOf<IntValidationOptions>().toExtend<
		NonNullable<IntFieldOptions['validation']>
	>()
})

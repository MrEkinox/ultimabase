import { expectTypeOf, test } from 'vitest'

import {
	defineSchemaExtension,
	intField,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
	type IntField,
	type IntFieldOptions,
	type IntValidationOptions,
} from '../../index.js'

test('preserves integer options and exact literals', () => {
	const field = intField({
		validation: {
			required: true,
			nullable: false,
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
		FieldDefinition<'int', number, IntFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'int'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<IntFieldOptions>>()
	expectTypeOf<FieldInferenceStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'forbidden'
		readonly nullable: false
		readonly list: false
	}>()
	expectTypeOf<IntField>().toExtend<
		FieldDefinition<'int', number, IntFieldOptions, FieldInferenceState>
	>()
})

test('rejects incompatible integer metadata', () => {
	// @ts-expect-error -- Integer fields do not expose float-only finite metadata.
	intField({ validation: { finite: true } })

	// @ts-expect-error -- Integer defaults must use JavaScript numbers.
	intField({ default: '0' })

	// @ts-expect-error -- Range boundaries must be JavaScript numbers.
	intField({ validation: { range: { min: '0' } } })

	// @ts-expect-error -- Required fields cannot also be nullable.
	intField({
		validation: {
			required: true,
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

import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	defineSchemaExtension,
	type BooleanField,
	type BooleanFieldOptions,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
} from '../../index.js'

test('preserves boolean defaults and common option literals', () => {
	const field = booleanField({
		validation: {
			required: true,
			nullable: false,
		},
		default: false,
		immutable: true,
		indexed: true,
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<
			'boolean',
			boolean,
			BooleanFieldOptions,
			FieldInferenceState
		>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'boolean'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<BooleanFieldOptions>>()
	expectTypeOf<FieldInferenceStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'forbidden'
		readonly nullable: false
		readonly list: false
	}>()
})

test('creates an exact empty option contract by default', () => {
	const field = booleanField()

	expectTypeOf(field).toExtend<BooleanField>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<BooleanFieldOptions>>()
})

test('rejects incompatible boolean metadata', () => {
	// @ts-expect-error -- Boolean defaults cannot use numeric values.
	booleanField({ default: 0 })
	// @ts-expect-error -- Required fields cannot also be nullable.
	booleanField({ validation: { required: true, nullable: true } })
	booleanField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.flag', {})],
	})

	expectTypeOf<BooleanFieldOptions>().toExtend<
		FieldDefinition<'boolean', boolean>['options']
	>()
})

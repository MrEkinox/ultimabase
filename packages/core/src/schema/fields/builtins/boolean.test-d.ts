import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	type BooleanField,
	type BooleanFieldOptions,
	type FieldDefinition,
	type FieldTypeState,
	type FieldTypeStateOf,
} from '../../index.js'

test('preserves boolean defaults and common option literals', () => {
	const field = booleanField({
		required: true,
		default: false,
		immutable: true,
		indexed: true,
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'boolean', boolean, BooleanFieldOptions, FieldTypeState>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'boolean'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<BooleanFieldOptions>>()
	expectTypeOf<FieldTypeStateOf<typeof field>>().toEqualTypeOf<{
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
	booleanField({
		// @ts-expect-error -- Removed generic extension metadata is not a field option.
		extensions: [],
	})

	expectTypeOf<BooleanFieldOptions>().toExtend<
		FieldDefinition<'boolean', boolean>['options']
	>()
})

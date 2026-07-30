import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	defineSchemaExtension,
	type BooleanField,
	type BooleanFieldOptions,
	type FieldDefinition,
} from '../src/index.js'

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

	// Boolean literals remain available to later create-input inference.
	expectTypeOf(field).toExtend<FieldDefinition<'boolean', boolean>>()
	expectTypeOf(field.kind).toEqualTypeOf<'boolean'>()
	expectTypeOf(field.options.validation.required).toEqualTypeOf<true>()
	expectTypeOf(field.options.default).toEqualTypeOf<false>()
	expectTypeOf(field.options.indexed).toEqualTypeOf<true>()
})

test('creates an exact empty option contract by default', () => {
	const field = booleanField()

	expectTypeOf(field).toExtend<BooleanField>()
	expectTypeOf(field.options).toEqualTypeOf<
		Readonly<Record<PropertyKey, never>>
	>()
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

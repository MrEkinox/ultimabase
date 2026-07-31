import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	type FieldDefinition,
	type FieldValidationOptions,
	type FieldValue,
	type PluginFieldDefinition,
} from '../index.js'

const normalizers = {
	normalizeValidation: (
		validation: FieldValidationOptions,
	): Readonly<FieldValidationOptions> => validation,
	snapshotValue: (value: unknown): string => String(value),
}

test('infers namespaced plugin kinds, values, and exact options', () => {
	const field = definePluginField(
		'fixture.custom',
		{
			validation: { required: true },
			default: 'value',
		},
		normalizers,
	)

	expectTypeOf(field).toExtend<
		PluginFieldDefinition<'fixture.custom', string>
	>()
	expectTypeOf(field).toExtend<FieldDefinition<'fixture.custom', string>>()
	expectTypeOf(field.kind).toEqualTypeOf<'fixture.custom'>()
	expectTypeOf(field.options.default).toEqualTypeOf<'value'>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<string>()
})

test('rejects framework-owned plugin kinds', () => {
	// @ts-expect-error -- Plugins cannot shadow a built-in field kind.
	definePluginField('string', {}, normalizers)

	// @ts-expect-error -- The opaque plan discriminant is framework-owned.
	definePluginField('plugin', {}, normalizers)
})

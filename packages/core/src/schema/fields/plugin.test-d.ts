import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	Schema,
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

test('types plugin storage codecs against the logical scalar value', () => {
	definePluginField(
		'fixture.stored',
		{},
		{
			...normalizers,
			storageCodec: {
				decode: (value: unknown): string => String(value),
				encode: (value: string): unknown => value,
				format: 'json',
				version: 1,
			},
		},
	)

	definePluginField(
		'fixture.invalid-storage',
		{},
		{
			...normalizers,
			storageCodec: {
				// @ts-expect-error -- Storage decoding must return the plugin field scalar.
				decode: (value: unknown): string => String(value),
				encode: (value: number): unknown => value,
				format: 'json',
				version: 1,
			},
		},
	)
})

test('rejects framework-owned plugin kinds', () => {
	// @ts-expect-error -- Plugins cannot shadow a built-in field kind.
	definePluginField('string', {}, normalizers)
	// @ts-expect-error -- Pointer identity belongs to Core relationship fields.
	definePluginField('pointer', {}, normalizers)

	// @ts-expect-error -- The opaque plan discriminant is framework-owned.
	definePluginField('plugin', {}, normalizers)
})

test('rejects contradictory presence metadata for plugin fields', () => {
	// @ts-expect-error -- Nullability is derived and cannot be configured.
	definePluginField(
		'fixture.custom',
		{
			validation: {
				required: true,
				nullable: true,
			},
		},
		normalizers,
	)
})

test('makes hook-resolved required plugin fields optional only during create input', () => {
	const field = definePluginField(
		'fixture.deferred',
		{ validation: { required: true } },
		{ ...normalizers, deferRequiredUntilResolveInput: true },
	)

	expectTypeOf(field.kind).toEqualTypeOf<'fixture.deferred'>()
	const schema = Schema.define({
		className: 'DeferredPost',
		fields: { generated: field },
	})
	const draft = new schema({})

	expectTypeOf(draft.generated).toEqualTypeOf<string | undefined>()
})

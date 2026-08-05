import { expectTypeOf, test } from 'vitest'

import {
	defineFieldExtension,
	defineSchemaExtension,
	stringField,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
	type StringField,
	type StringFieldOptions,
	type StringValidationOptions,
} from '../../index.js'

test('retains only string metadata that affects inference', () => {
	const field = stringField({
		validation: {
			required: true,
			length: {
				min: 2,
				max: 40,
			},
			match: /^[a-z]+$/u,
		},
		default: 'anonymous',
		immutable: true,
		indexed: 'unique',
		description: 'Public display name',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'string', string, StringFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'string'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<StringFieldOptions>>()
	expectTypeOf<FieldInferenceStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'forbidden'
		readonly nullable: false
		readonly list: false
	}>()
})

test('represents optional, nullable, and defaulted variants independently', () => {
	const optional = stringField()
	const nullable = stringField()
	const defaulted = stringField({ default: 'pending' })

	expectTypeOf(optional).toExtend<StringField>()
	expectTypeOf(nullable).toExtend<StringField>()
	expectTypeOf(defaulted).toExtend<StringField>()
	expectTypeOf(optional.options).toEqualTypeOf<Readonly<StringFieldOptions>>()
	expectTypeOf<
		FieldInferenceStateOf<typeof nullable>['nullable']
	>().toEqualTypeOf<true>()
	expectTypeOf<
		FieldInferenceStateOf<typeof defaulted>['object']
	>().toEqualTypeOf<'required'>()
})

test('preserves field extension literals', () => {
	const extension = defineFieldExtension('fixture.visibility', {
		mode: 'private',
	})
	const field = stringField({ extensions: [extension] })

	expectTypeOf(field.options).toEqualTypeOf<Readonly<StringFieldOptions>>()
})

test('rejects incompatible string metadata', () => {
	// @ts-expect-error -- String defaults must use the field's base value type.
	stringField({ default: 42 })
	// @ts-expect-error -- Nullability is derived and cannot be configured.
	stringField({ validation: { required: true, nullable: true } })
	// @ts-expect-error -- Patterns use the native RegExp contract.
	stringField({ validation: { match: '^[a-z]+$' } })
	// @ts-expect-error -- String constraints belong inside validation.
	stringField({ minLength: 2 })
	// @ts-expect-error -- Index uniqueness uses the indexed option.
	stringField({ unique: true })
	stringField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.visibility', {})],
	})

	expectTypeOf<StringFieldOptions>().toExtend<
		FieldDefinition<'string', string>['options']
	>()
	expectTypeOf<StringValidationOptions>().toExtend<
		NonNullable<StringFieldOptions['validation']>
	>()
})

import { expectTypeOf, test } from 'vitest'

import {
	defineFieldExtension,
	defineSchemaExtension,
	stringField,
	type FieldDefinition,
	type StringField,
	type StringFieldOptions,
	type StringValidationOptions,
} from '../../index.js'

test('preserves every string option literal', () => {
	const field = stringField({
		validation: {
			required: true,
			nullable: false,
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

	// Exact metadata remains available to object and input inference implemented later.
	expectTypeOf(field).toExtend<FieldDefinition<'string', string>>()
	expectTypeOf(field.kind).toEqualTypeOf<'string'>()
	expectTypeOf(field.options.validation.required).toEqualTypeOf<true>()
	expectTypeOf(field.options.validation.nullable).toEqualTypeOf<false>()
	expectTypeOf(field.options.validation.length.min).toEqualTypeOf<2>()
	expectTypeOf(field.options.validation.length.max).toEqualTypeOf<40>()
	expectTypeOf(field.options.default).toEqualTypeOf<'anonymous'>()
	expectTypeOf(field.options.indexed).toEqualTypeOf<'unique'>()
})

test('represents optional, nullable, and defaulted variants independently', () => {
	const optional = stringField()
	const nullable = stringField({ validation: { nullable: true } })
	const defaulted = stringField({ default: 'pending' })

	expectTypeOf(optional).toExtend<StringField>()
	expectTypeOf(optional.options).toEqualTypeOf<
		Readonly<Record<PropertyKey, never>>
	>()
	expectTypeOf(nullable.options.validation.nullable).toEqualTypeOf<true>()
	expectTypeOf(defaulted.options.default).toEqualTypeOf<'pending'>()
})

test('preserves field extension literals', () => {
	const extension = defineFieldExtension('fixture.visibility', {
		mode: 'private',
	})
	const field = stringField({ extensions: [extension] })

	expectTypeOf(field.options.extensions).toEqualTypeOf<
		readonly [
			{
				readonly scope: 'field'
				readonly name: 'fixture.visibility'
				readonly config: Readonly<{ readonly mode: 'private' }>
			},
		]
	>()
})

test('rejects incompatible string metadata', () => {
	// @ts-expect-error -- String defaults must use the field's base value type.
	stringField({ default: 42 })
	// @ts-expect-error -- Required fields cannot also be nullable.
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

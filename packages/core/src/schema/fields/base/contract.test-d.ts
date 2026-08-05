import { expectTypeOf, test } from 'vitest'

import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from '../../index.js'

test('represents every common field option without widening literals', () => {
	const options = {
		validation: {
			required: true,
		},
		default: 'anonymous',
		immutable: true,
		indexed: 'unique',
		description: 'Public display name',
	} as const satisfies FieldOptions<string>
	const field = {
		kind: 'string',
		options,
	} as const satisfies FieldDefinition<'string', string, typeof options>

	// Literal kinds and options must remain available to later inference utilities.
	expectTypeOf(field.kind).toEqualTypeOf<'string'>()
	expectTypeOf(field.options.default).toEqualTypeOf<'anonymous'>()
	expectTypeOf(field.options.indexed).toEqualTypeOf<'unique'>()
})

test('represents optional and required presence', () => {
	const optional = {} as const satisfies FieldValidationOptions
	const explicitOptional = {
		required: false,
	} as const satisfies FieldValidationOptions

	expectTypeOf(optional).toExtend<FieldValidationOptions>()
	expectTypeOf(explicitOptional.required).toEqualTypeOf<false>()
})

test('distinguishes regular, unique, and disabled indexing', () => {
	const regular = { indexed: true } as const satisfies FieldOptions<string>
	const unique = {
		indexed: 'unique',
	} as const satisfies FieldOptions<string>
	const disabled = { indexed: false } as const satisfies FieldOptions<string>

	expectTypeOf(regular.indexed).toEqualTypeOf<true>()
	expectTypeOf(unique.indexed).toEqualTypeOf<'unique'>()
	expectTypeOf(disabled.indexed).toEqualTypeOf<false>()
})

test('rejects nullable and invalid metadata values', () => {
	const invalidPresence: FieldOptions<string> = {
		validation: {
			// @ts-expect-error -- Nullability is derived from required presence.
			nullable: true,
		},
	}
	// Static defaults must match the field's base value type.
	// @ts-expect-error -- A string field cannot use a numeric default.
	const invalidDefault: FieldOptions<string> = { default: 42 }
	// @ts-expect-error -- Unique indexing uses one explicit literal.
	const invalidIndex: FieldOptions<string> = { indexed: 'non-unique' }

	expectTypeOf(invalidPresence).toEqualTypeOf<FieldOptions<string>>()
	expectTypeOf(invalidDefault).toEqualTypeOf<FieldOptions<string>>()
	expectTypeOf(invalidIndex).toEqualTypeOf<FieldOptions<string>>()
})

test('exposes readonly field metadata', () => {
	const options = {
		validation: {
			required: true,
		},
	} as const satisfies FieldOptions<string>
	const field: FieldDefinition<'string', string, typeof options> = {
		kind: 'string',
		options,
	}

	// Public field metadata cannot be reassigned after construction.
	// @ts-expect-error -- Field kinds are immutable.
	field.kind = 'number'
	// @ts-expect-error -- Field validation metadata is immutable.
	field.options.validation.required = false

	expectTypeOf(field.kind).toEqualTypeOf<'string'>()
})

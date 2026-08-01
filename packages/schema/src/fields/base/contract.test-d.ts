import { expectTypeOf, test } from 'vitest'

import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	ValidatedFieldOptions,
} from '../../index.js'

test('represents every common field option without widening literals', () => {
	const options = {
		validation: {
			required: true,
			nullable: false,
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

test('keeps optional and nullable presence independent', () => {
	const optional = {} as const satisfies FieldValidationOptions
	const nullable = {
		nullable: true,
	} as const satisfies FieldValidationOptions
	const explicitOptional = {
		required: false,
		nullable: false,
	} as const satisfies FieldValidationOptions

	expectTypeOf(optional).toExtend<FieldValidationOptions>()
	expectTypeOf(nullable.nullable).toEqualTypeOf<true>()
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

test('rejects contradictory presence and invalid metadata values', () => {
	const invalidPresence = {
		validation: {
			required: true,
			nullable: true,
		},
	} as const satisfies FieldOptions<string>
	// Static defaults must match the field's base value type.
	// @ts-expect-error -- A string field cannot use a numeric default.
	const invalidDefault: FieldOptions<string> = { default: 42 }
	// @ts-expect-error -- Unique indexing uses one explicit literal.
	const invalidIndex: FieldOptions<string> = { indexed: 'non-unique' }

	// Exact factory validation rejects the dependent presence combination.
	expectTypeOf<
		ValidatedFieldOptions<typeof invalidPresence, string>
	>().toBeNever()
	expectTypeOf(invalidPresence).toExtend<FieldOptions<string>>()
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

import { expectTypeOf, test } from 'vitest'

import type {
	FieldDefinition,
	FieldOptions,
	FieldPresenceOptions,
} from '../src/index.js'

test('represents every common field option without widening literals', () => {
	const options = {
		required: true,
		nullable: false,
		default: 'anonymous',
		immutable: true,
		unique: true,
		index: true,
		description: 'Public display name',
	} as const satisfies FieldOptions<string>
	const field = {
		kind: 'string',
		options,
	} as const satisfies FieldDefinition<'string', string, typeof options>

	// Literal kinds and options must remain available to later inference utilities.
	expectTypeOf(field.kind).toEqualTypeOf<'string'>()
	expectTypeOf(field.options.default).toEqualTypeOf<'anonymous'>()
})

test('keeps optional and nullable presence independent', () => {
	const optional = {} as const satisfies FieldPresenceOptions
	const nullable = {
		nullable: true,
	} as const satisfies FieldPresenceOptions
	const explicitOptional = {
		required: false,
		nullable: false,
	} as const satisfies FieldPresenceOptions

	expectTypeOf(optional).toExtend<FieldPresenceOptions>()
	expectTypeOf(nullable.nullable).toEqualTypeOf<true>()
	expectTypeOf(explicitOptional.required).toEqualTypeOf<false>()
})

test('rejects contradictory presence and invalid metadata values', () => {
	// A required field cannot accept null according to the schema data conventions.
	// @ts-expect-error -- Required and nullable cannot both be true.
	const invalidPresence: FieldOptions<string> = {
		required: true,
		nullable: true,
	}
	// Static defaults must match the field's base value type.
	// @ts-expect-error -- A string field cannot use a numeric default.
	const invalidDefault: FieldOptions<string> = { default: 42 }

	expectTypeOf(invalidPresence).toEqualTypeOf<FieldOptions<string>>()
	expectTypeOf(invalidDefault).toEqualTypeOf<FieldOptions<string>>()
})

test('exposes readonly field metadata', () => {
	const options = {
		required: true,
	} as const satisfies FieldOptions<string>
	const field: FieldDefinition<'string', string, typeof options> = {
		kind: 'string',
		options,
	}

	// Public field metadata cannot be reassigned after construction.
	// @ts-expect-error -- Field kinds are immutable.
	field.kind = 'number'
	// @ts-expect-error -- Field options are immutable.
	field.options.required = false

	expectTypeOf(field.kind).toEqualTypeOf<'string'>()
})

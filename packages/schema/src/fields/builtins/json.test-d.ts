import { expectTypeOf, test } from 'vitest'

import {
	defineSchemaExtension,
	jsonField,
	type FieldDefinition,
	type FieldInferenceState,
	type JsonFieldOptions,
	type JsonField,
	type JsonValue,
} from '../../index.js'

test('exposes a safe recursive JSON value', () => {
	const field = jsonField({
		default: {
			active: true,
			count: 2,
			nested: ['first', null, { valid: false }],
		},
		indexed: true,
	})

	// JSON inference remains safe without widening to an unsafe catch-all type.
	expectTypeOf(field).toExtend<
		FieldDefinition<'json', JsonValue, JsonFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<JsonFieldOptions>>()
	expectTypeOf<JsonField>().toExtend<
		FieldDefinition<'json', JsonValue, JsonFieldOptions, FieldInferenceState>
	>()
})

test('rejects values that do not have a portable JSON representation', () => {
	jsonField({
		// @ts-expect-error -- Undefined has no JSON value representation.
		default: { missing: undefined },
	})
	jsonField({
		// @ts-expect-error -- Dates require an explicit field and adapter codec.
		default: { createdAt: new Date() },
	})
	jsonField({
		// @ts-expect-error -- BigInt cannot be serialized as JSON.
		default: { identifier: 1n },
	})
	jsonField({
		// @ts-expect-error -- Functions are not JSON values.
		default: { resolve: () => 'value' },
	})
	jsonField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.json', {})],
	})
})

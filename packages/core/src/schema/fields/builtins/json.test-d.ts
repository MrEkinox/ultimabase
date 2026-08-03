import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	defineSchemaExtension,
	jsonField,
	type FieldDefinition,
	type FieldInferenceState,
	type InferObject,
	type JsonDocument,
	type JsonFieldOptions,
	type JsonField,
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
		FieldDefinition<'json', JsonDocument, JsonFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<JsonFieldOptions>>()
	expectTypeOf<JsonField>().toExtend<
		FieldDefinition<'json', JsonDocument, JsonFieldOptions, FieldInferenceState>
	>()
})

test('reserves root null for explicit field nullability', () => {
	const schema = Schema.define({
		className: 'JsonDocuments',
		fields: {
			document: jsonField(),
			nullableDocument: jsonField({ validation: { nullable: true } }),
		},
	})

	expectTypeOf(schema.className).toEqualTypeOf<'JsonDocuments'>()
	expectTypeOf<InferObject<typeof schema>>().toEqualTypeOf<{
		readonly id: string
		readonly createdAt: string
		readonly updatedAt: string
		readonly document?: JsonDocument
		readonly nullableDocument?: JsonDocument | null
	}>()
})

test('rejects values that do not have a portable JSON representation', () => {
	// @ts-expect-error -- Undefined has no JSON value representation.
	jsonField({
		default: { missing: undefined },
	})
	// @ts-expect-error -- Dates require an explicit field and adapter codec.
	jsonField({
		default: { createdAt: new Date() },
	})
	// @ts-expect-error -- BigInt cannot be serialized as JSON.
	jsonField({
		default: { identifier: 1n },
	})
	// @ts-expect-error -- Functions are not JSON values.
	jsonField({
		default: { resolve: () => 'value' },
	})
	jsonField({
		// @ts-expect-error -- Root strings require a dedicated scalar field.
		default: 'value',
	})
	jsonField({
		// @ts-expect-error -- Root numbers require a dedicated scalar field.
		default: 1,
	})
	jsonField({
		// @ts-expect-error -- Root booleans require a dedicated scalar field.
		default: true,
	})
	jsonField({
		// @ts-expect-error -- Root null is controlled by field nullability.
		default: null,
	})
	jsonField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.json', {})],
	})
})

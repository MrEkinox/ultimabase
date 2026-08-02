import { Buffer } from 'node:buffer'

import { expectTypeOf, test } from 'vitest'

import {
	binaryField,
	defineSchemaExtension,
	type BinaryField,
	type BinaryFieldOptions,
	type BinaryValidationOptions,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
	type FieldValue,
} from '../../index.js'

test('preserves binary options and native byte values', () => {
	const bytes = new Uint8Array([1, 2, 3])
	const field = binaryField({
		validation: {
			required: true,
			length: {
				min: 1,
				max: 1024,
			},
		},
		default: bytes,
		indexed: false,
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<
			'binary',
			Uint8Array,
			BinaryFieldOptions,
			FieldInferenceState
		>
	>()
	expectTypeOf(field).toExtend<BinaryField>()
	expectTypeOf(field.kind).toEqualTypeOf<'binary'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<BinaryFieldOptions>>()
	expectTypeOf<FieldInferenceStateOf<typeof field>>().toEqualTypeOf<{
		readonly create: 'optional'
		readonly object: 'required'
		readonly update: 'optional'
		readonly nullable: false
		readonly list: false
	}>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<Uint8Array>()
})

test('accepts Buffer values and homogeneous binary lists', () => {
	const buffer = binaryField({ default: Buffer.from([1]) })
	const list = binaryField({
		list: true,
		default: [new Uint8Array([1]), Buffer.from([2])],
	})

	expectTypeOf(buffer.options).toEqualTypeOf<Readonly<BinaryFieldOptions>>()
	expectTypeOf(list).toExtend<BinaryField>()
	expectTypeOf<FieldValue<typeof list>>().toEqualTypeOf<readonly Uint8Array[]>()
})

test('creates an exact empty option contract by default', () => {
	const field = binaryField()

	expectTypeOf(field.options).toEqualTypeOf<Readonly<BinaryFieldOptions>>()
})

test('rejects incompatible binary metadata', () => {
	// @ts-expect-error -- Strings are transport encodings rather than native bytes.
	binaryField({ default: 'AQID' })

	// @ts-expect-error -- Generic array buffers are not byte sequences.
	binaryField({ default: new ArrayBuffer(4) })

	// @ts-expect-error -- Runtime factories must produce native byte sequences.
	binaryField({ default: () => 'AQID' })

	// @ts-expect-error -- Required fields cannot also be nullable.
	binaryField({ validation: { required: true, nullable: true } })

	binaryField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.binary', {})],
	})

	expectTypeOf<BinaryValidationOptions>().toExtend<
		NonNullable<BinaryFieldOptions['validation']>
	>()
})

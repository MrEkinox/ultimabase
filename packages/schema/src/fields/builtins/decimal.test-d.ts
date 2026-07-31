import { expectTypeOf, test } from 'vitest'

import {
	decimalField,
	defineSchemaExtension,
	type DecimalField,
	type DecimalFieldOptions,
	type DecimalValidationOptions,
	type FieldDefinition,
	type FieldValue,
} from '../../index.js'

test('preserves exact decimal options and string values', () => {
	const field = decimalField({
		validation: {
			required: true,
			precision: 12,
			scale: 2,
			range: {
				min: '-9999999999.99',
				max: '9999999999.99',
			},
		},
		default: '19.99',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'decimal', string, DecimalFieldOptions>
	>()
	expectTypeOf(field).toExtend<DecimalField>()
	expectTypeOf(field.kind).toEqualTypeOf<'decimal'>()
	expectTypeOf(field.options.default).toEqualTypeOf<'19.99'>()
	expectTypeOf(field.options.validation.precision).toEqualTypeOf<12>()
	expectTypeOf(field.options.validation.scale).toEqualTypeOf<2>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<string>()
})

test('infers homogeneous exact decimal lists', () => {
	const field = decimalField({
		list: true,
		default: ['1.25', '2.50'],
	})

	expectTypeOf(field).toExtend<DecimalField>()
	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<readonly string[]>()
})

test('creates an exact empty option contract by default', () => {
	const field = decimalField()

	expectTypeOf(field.options).toEqualTypeOf<
		Readonly<Record<PropertyKey, never>>
	>()
})

test('rejects incompatible decimal metadata', () => {
	// @ts-expect-error -- Numbers cannot preserve arbitrary decimal precision.
	decimalField({ default: 19.99 })

	// @ts-expect-error -- Decimal range boundaries use exact strings.
	decimalField({ validation: { range: { min: 0 } } })

	// @ts-expect-error -- Runtime factories must produce exact decimal strings.
	decimalField({ default: () => 19.99 })

	// @ts-expect-error -- Required fields cannot also be nullable.
	decimalField({ validation: { required: true, nullable: true } })

	decimalField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.decimal', {})],
	})

	expectTypeOf<DecimalValidationOptions>().toExtend<
		NonNullable<DecimalFieldOptions['validation']>
	>()
})

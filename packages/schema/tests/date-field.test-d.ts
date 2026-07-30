import { expectTypeOf, test } from 'vitest'

import {
	dateField,
	defineSchemaExtension,
	type DateField,
	type DateFieldOptions,
	type DateValidationOptions,
	type FieldDefinition,
} from '../src/index.js'

test('infers server-side Date values and range boundaries', () => {
	const field = dateField({
		validation: {
			required: true,
			nullable: false,
			range: {
				min: new Date('2026-01-01T00:00:00.000Z'),
				max: new Date('2026-12-31T23:59:59.999Z'),
			},
		},
		default: new Date('2026-06-01T12:00:00.000Z'),
		indexed: true,
	})

	// Transport strings never replace the server-side Date value contract.
	expectTypeOf(field).toExtend<FieldDefinition<'date', Date>>()
	expectTypeOf(field.kind).toEqualTypeOf<'date'>()
	expectTypeOf(field.options.default).toEqualTypeOf<Date>()
	expectTypeOf(field.options.validation.range.min).toEqualTypeOf<Date>()
	expectTypeOf(field.options.validation.range.max).toEqualTypeOf<Date>()
})

test('creates an exact empty option contract by default', () => {
	const field = dateField()

	expectTypeOf(field).toExtend<DateField>()
	expectTypeOf(field.options).toEqualTypeOf<
		Readonly<Record<PropertyKey, never>>
	>()
})

test('rejects transport values and invalid default factories', () => {
	// @ts-expect-error -- ISO strings belong to transport serialization.
	dateField({ default: '2026-01-01T00:00:00.000Z' })
	// @ts-expect-error -- Date range boundaries use server-side Date values.
	dateField({ validation: { range: { min: 0 } } })
	// @ts-expect-error -- Runtime factories must produce Date values.
	dateField({ default: () => '2026-01-01' })
	// @ts-expect-error -- Required fields cannot also be nullable.
	dateField({ validation: { required: true, nullable: true } })
	dateField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.date', {})],
	})

	expectTypeOf<DateFieldOptions>().toExtend<
		FieldDefinition<'date', Date>['options']
	>()
	expectTypeOf<DateValidationOptions>().toExtend<
		NonNullable<DateFieldOptions['validation']>
	>()
})

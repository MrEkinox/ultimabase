import { expectTypeOf, test } from 'vitest'

import {
	dateTimeField,
	defineSchemaExtension,
	type DateTimeField,
	type DateTimeFieldOptions,
	type DateTimeValidationOptions,
	type FieldDefinition,
} from '../../../src/index.js'

test('preserves date-time options and exact literals', () => {
	const field = dateTimeField({
		timezone: false,
		validation: {
			required: true,
			range: {
				min: '2026-01-01T00:00:00.000',
				max: '2026-12-31T23:59:59.999',
			},
		},
		default: 'now',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'dateTime', string, DateTimeFieldOptions>
	>()
	expectTypeOf(field).toExtend<DateTimeField>()
	expectTypeOf(field.kind).toEqualTypeOf<'dateTime'>()
	expectTypeOf(field.options.timezone).toEqualTypeOf<false>()
	expectTypeOf(field.options.default).toEqualTypeOf<'now'>()
})

test('creates an exact empty option contract by default', () => {
	const field = dateTimeField()

	expectTypeOf(field.options).toEqualTypeOf<
		Readonly<Record<PropertyKey, never>>
	>()
})

test('rejects incompatible date-time metadata', () => {
	// @ts-expect-error -- Date objects are not date-time strings.
	dateTimeField({ default: new Date() })

	// @ts-expect-error -- Date-time ranges use strings.
	dateTimeField({ validation: { range: { min: 0 } } })

	// @ts-expect-error -- Runtime factories must produce date-time strings.
	dateTimeField({ default: () => new Date() })

	// @ts-expect-error -- Required fields cannot also be nullable.
	dateTimeField({ validation: { required: true, nullable: true } })

	dateTimeField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.dateTime', {})],
	})

	expectTypeOf<DateTimeValidationOptions>().toExtend<
		NonNullable<DateTimeFieldOptions['validation']>
	>()
})

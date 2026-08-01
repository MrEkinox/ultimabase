import { expectTypeOf, test } from 'vitest'

import {
	dateField,
	defineSchemaExtension,
	type DateField,
	type DateFieldOptions,
	type DateValidationOptions,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
} from '../../index.js'

test('infers calendar-day values and range boundaries', () => {
	const field = dateField({
		validation: {
			required: true,
			nullable: false,
			range: {
				min: '2026-01-01',
				max: '2026-12-31',
			},
		},
		autoNow: true,
		indexed: true,
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'date', string, DateFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field.kind).toEqualTypeOf<'date'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<DateFieldOptions>>()
	expectTypeOf<
		FieldInferenceStateOf<typeof field>['object']
	>().toEqualTypeOf<'required'>()
})

test('creates an exact empty option contract by default', () => {
	const field = dateField()

	expectTypeOf(field).toExtend<DateField>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<DateFieldOptions>>()
})

test('rejects non-string values and invalid default factories', () => {
	// @ts-expect-error -- Date objects are not calendar-day strings.
	dateField({ default: new Date() })

	// @ts-expect-error -- Date range boundaries use calendar-day strings.
	dateField({ validation: { range: { min: new Date() } } })

	// @ts-expect-error -- Runtime factories must produce calendar-day strings.
	dateField({ default: () => new Date() })

	// @ts-expect-error -- Clock generation and developer defaults are exclusive.
	dateField({ autoNow: true, default: '2026-01-01' })

	// @ts-expect-error -- Clock generation produces one scalar value.
	dateField({ autoNow: true, list: true })

	// @ts-expect-error -- Required fields cannot also be nullable.
	dateField({ validation: { required: true, nullable: true } })

	dateField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.date', {})],
	})

	expectTypeOf<DateFieldOptions>().toExtend<
		FieldDefinition<'date', string>['options']
	>()
	expectTypeOf<DateValidationOptions>().toExtend<
		NonNullable<DateFieldOptions['validation']>
	>()
})

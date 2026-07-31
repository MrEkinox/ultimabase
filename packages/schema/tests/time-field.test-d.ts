import { expectTypeOf, test } from 'vitest'

import {
	defineSchemaExtension,
	timeField,
	type FieldDefinition,
	type TimeField,
	type TimeFieldOptions,
	type TimeValidationOptions,
} from '../src/index.js'

test('preserves time options and exact literals', () => {
	const field = timeField({
		timezone: true,
		validation: {
			required: true,
			range: {
				min: '08:00:00.000Z',
				max: '18:00:00.000Z',
			},
		},
		default: 'now',
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'time', string, TimeFieldOptions>
	>()
	expectTypeOf(field).toExtend<TimeField>()
	expectTypeOf(field.kind).toEqualTypeOf<'time'>()
	expectTypeOf(field.options.timezone).toEqualTypeOf<true>()
	expectTypeOf(field.options.default).toEqualTypeOf<'now'>()
})

test('creates an exact empty option contract by default', () => {
	const field = timeField()

	expectTypeOf(field.options).toEqualTypeOf<
		Readonly<Record<PropertyKey, never>>
	>()
})

test('rejects incompatible time metadata', () => {
	// @ts-expect-error -- Numbers are not time strings.
	timeField({ default: 9 })

	// @ts-expect-error -- Time ranges use strings.
	timeField({ validation: { range: { min: 0 } } })

	// @ts-expect-error -- Runtime factories must produce time strings.
	timeField({ default: () => new Date() })

	// @ts-expect-error -- Required fields cannot also be nullable.
	timeField({ validation: { required: true, nullable: true } })

	timeField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.time', {})],
	})

	expectTypeOf<TimeValidationOptions>().toExtend<
		NonNullable<TimeFieldOptions['validation']>
	>()
})

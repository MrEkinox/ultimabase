import { expectTypeOf, test } from 'vitest'

import {
	defineSchemaExtension,
	timeField,
	type FieldDefinition,
	type FieldInferenceState,
	type FieldInferenceStateOf,
	type TimeField,
	type TimeFieldOptions,
	type TimeValidationOptions,
} from '../../index.js'

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
		autoNow: true,
	})

	expectTypeOf(field).toExtend<
		FieldDefinition<'time', string, TimeFieldOptions, FieldInferenceState>
	>()
	expectTypeOf(field).toExtend<TimeField>()
	expectTypeOf(field.kind).toEqualTypeOf<'time'>()
	expectTypeOf(field.options).toEqualTypeOf<Readonly<TimeFieldOptions>>()
	expectTypeOf<
		FieldInferenceStateOf<typeof field>['object']
	>().toEqualTypeOf<'required'>()
})

test('creates an exact empty option contract by default', () => {
	const field = timeField()

	expectTypeOf(field.options).toEqualTypeOf<Readonly<TimeFieldOptions>>()
})

test('rejects incompatible time metadata', () => {
	// @ts-expect-error -- Numbers are not time strings.
	timeField({ default: 9 })

	// @ts-expect-error -- Time ranges use strings.
	timeField({ validation: { range: { min: 0 } } })

	// @ts-expect-error -- Runtime factories must produce time strings.
	timeField({ default: () => new Date() })

	// @ts-expect-error -- Clock generation and developer defaults are exclusive.
	timeField({ autoNow: true, default: '09:30:00.000' })

	// @ts-expect-error -- Clock generation produces one scalar value.
	timeField({ autoNow: true, list: true })

	timeField({
		validation: {
			required: true,
			// @ts-expect-error -- Nullability is derived and cannot be configured.
			nullable: true,
		},
	})

	timeField({
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.time', {})],
	})

	expectTypeOf<TimeValidationOptions>().toExtend<
		NonNullable<TimeFieldOptions['validation']>
	>()
})

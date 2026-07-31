import { expectTypeOf, test } from 'vitest'

import {
	DatabaseDefault,
	booleanField,
	dateField,
	enumField,
	jsonField,
	objectField,
	stringField,
	type DefaultFactory,
	type FieldDefault,
} from '../src/index.js'

test('preserves exact static, runtime, and database default types', () => {
	const staticField = stringField({ default: 'anonymous' })
	const runtimeFactory = (): Date => new Date()
	const runtimeField = dateField({ default: runtimeFactory })
	const databaseDefault = new DatabaseDefault<
		Date,
		{ readonly precision: number }
	>('postgres.currentTimestamp', { precision: 3 })
	const databaseField = dateField({ default: databaseDefault })

	expectTypeOf(staticField.options.default).toEqualTypeOf<'anonymous'>()
	expectTypeOf(runtimeField.options.default).toEqualTypeOf<() => Date>()
	expectTypeOf(databaseField.options.default).toEqualTypeOf<
		DatabaseDefault<Date, { readonly precision: number }>
	>()
	expectTypeOf(databaseDefault.config.precision).toEqualTypeOf<number>()
	expectTypeOf<DefaultFactory<boolean>>().toEqualTypeOf<() => boolean>()
	expectTypeOf<FieldDefault<string>>().toEqualTypeOf<
		string | (() => string) | DatabaseDefault<string>
	>()
})

test('checks runtime factory outputs against every field value', () => {
	stringField({ default: () => 'generated' })
	booleanField({ default: () => true })
	dateField({ default: () => new Date() })
	enumField({
		values: ['draft', 'published'],
		default: () => 'draft',
	})
	jsonField({
		default: () => ({ generated: true }),
	})
	stringField({
		list: true,
		default: () => ['generated'],
	})
	objectField({
		fields: {
			name: stringField(),
		},
		default: () => ({ name: 'generated' }),
	})

	// @ts-expect-error -- A string factory cannot provide boolean values.
	booleanField({ default: () => 'true' })
	// @ts-expect-error -- Date factories must return Date objects.
	dateField({ default: () => '2026-07-30' })
	enumField({
		values: ['draft', 'published'],
		// @ts-expect-error -- Enum factories must return one persisted enum value.
		default: () => 'archived',
	})
	stringField({
		list: true,
		// @ts-expect-error -- List factories must preserve the field's scalar type.
		default: () => [1],
	})
	// @ts-expect-error -- Object factories must preserve the nested field shape.
	objectField({
		fields: {
			name: stringField(),
		},
		default: () => ({ name: false }),
	})
})

test('rejects database defaults for incompatible field values', () => {
	const dateDefault = new DatabaseDefault<Date>('fixture.date', {})

	dateField({ default: dateDefault })
	// @ts-expect-error -- A Date database default cannot provide strings.
	stringField({ default: dateDefault })
})

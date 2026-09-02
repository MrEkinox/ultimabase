import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	dateField,
	dateTimeField,
	enumField,
	jsonField,
	objectField,
	stringField,
	type DefaultFactory,
	type FieldDefault,
} from '../../index.js'

test('accepts static and runtime defaults through one public contract', () => {
	stringField({ default: 'anonymous' })
	const runtimeFactory = (): string => '2026-07-30T12:00:00.000Z'
	dateTimeField({ default: runtimeFactory })

	expectTypeOf<DefaultFactory<boolean>>().toEqualTypeOf<() => boolean>()
	expectTypeOf<FieldDefault<string>>().toEqualTypeOf<string | (() => string)>()
})

test('checks runtime factory outputs against every field value', () => {
	stringField({ default: () => 'generated' })
	booleanField({ default: () => true })
	dateField({ default: () => '2026-07-30' })
	dateTimeField({ default: () => '2026-07-30T12:00:00.000Z' })
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
	// @ts-expect-error -- Date-time factories cannot return Date objects.
	dateTimeField({ default: () => new Date() })
	// @ts-expect-error -- Enum factories must return one persisted enum value.
	enumField({
		values: ['draft', 'published'],
		default: () => 'archived',
	})
	// @ts-expect-error -- List factories must preserve the field's scalar type.
	stringField({
		list: true,
		default: () => [1],
	})
	const invalidName = stringField()
	objectField<{ readonly name: typeof invalidName }>({
		fields: {
			name: invalidName,
		},
		// @ts-expect-error -- Object factories must preserve the nested field shape.
		default: () => ({ name: false }),
	})
})

test('rejects adapter-specific descriptors as portable field defaults', () => {
	// @ts-expect-error -- Database expressions belong to adapter plugins.
	dateTimeField({
		default: { kind: 'database', expression: 'CURRENT_TIMESTAMP' },
	})
})

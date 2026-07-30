import { expectTypeOf, test } from 'vitest'

import {
	arrayField,
	booleanField,
	dateField,
	defineSchemaExtension,
	numberField,
	objectField,
	stringField,
	type ArrayField,
	type FieldDefinition,
	type FieldValue,
	type ObjectField,
	type ObjectFieldValue,
} from '../src/index.js'

test('infers array elements through finite nesting', () => {
	const strings = arrayField({
		items: stringField(),
		default: ['first', 'second'],
	})
	const matrix = arrayField({
		items: arrayField({
			items: numberField({ mode: 'integer' }),
		}),
	})

	expectTypeOf(strings).toExtend<FieldDefinition<'array', readonly string[]>>()
	expectTypeOf(strings.options.default).toEqualTypeOf<
		readonly ['first', 'second']
	>()
	expectTypeOf<FieldValue<typeof matrix>>().toEqualTypeOf<
		readonly (readonly number[])[]
	>()
	expectTypeOf(matrix.options.items.kind).toEqualTypeOf<'array'>()
	expectTypeOf<ArrayField>().toExtend<
		FieldDefinition<'array', readonly unknown[]>
	>()
})

test('infers structured values from reusable fields', () => {
	const fields = {
		name: stringField({
			validation: {
				required: true,
			},
		}),
		active: booleanField(),
		createdAt: dateField(),
		tags: arrayField({
			items: stringField(),
		}),
	}
	const field = objectField({ fields })

	interface ExpectedValue {
		readonly name: string
		readonly active: boolean
		readonly createdAt: Date
		readonly tags: readonly string[]
	}

	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<ExpectedValue>()
	expectTypeOf(field.options.fields.name.kind).toEqualTypeOf<'string'>()
	expectTypeOf<ObjectFieldValue<typeof fields>>().toEqualTypeOf<ExpectedValue>()
	expectTypeOf<ObjectField>().toExtend<
		FieldDefinition<'object', Readonly<Record<string, unknown>>>
	>()
})

test('rejects invalid child definitions and defaults', () => {
	arrayField({
		// @ts-expect-error -- Array elements must be field definitions.
		items: 'string',
	})
	objectField({
		fields: {
			// @ts-expect-error -- Object properties must be field definitions.
			name: 'string',
		},
	})
	arrayField({
		items: booleanField(),
		// @ts-expect-error -- Array defaults must match their element field.
		default: [true, 'false'],
	})
	objectField({
		fields: {
			name: stringField(),
			active: booleanField(),
		},
		default: {
			name: 'fixture',
			// @ts-expect-error -- Object defaults must use each child field value type.
			active: 'yes',
		},
	})
	arrayField({
		items: stringField(),
		// @ts-expect-error -- Schema extensions cannot attach to individual fields.
		extensions: [defineSchemaExtension('fixture.array', {})],
	})
})

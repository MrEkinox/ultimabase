import { expectTypeOf, test } from 'vitest'

import {
	booleanField,
	dateField,
	defineSchemaExtension,
	enumField,
	intField,
	jsonField,
	objectField,
	stringField,
	type FieldDefinition,
	type FieldListValue,
	type FieldValue,
	type JsonValue,
	type ObjectField,
	type ObjectFieldValue,
} from '../src/index.js'

test('infers list values through finite nesting', () => {
	const strings = stringField({
		list: true,
		default: ['first', 'second'],
	})
	const matrix = intField({
		list: [true, true],
		default: [[1, 2]],
	})
	const scalar = booleanField({ list: false })
	const dates = dateField({ list: true })
	const statuses = enumField({
		values: ['draft', 'published'],
		list: true,
	})
	const payloads = jsonField({ list: true })

	expectTypeOf(strings).toExtend<FieldDefinition<'string', string>>()
	expectTypeOf(strings.options.default).toEqualTypeOf<
		readonly ['first', 'second']
	>()
	expectTypeOf<FieldValue<typeof strings>>().toEqualTypeOf<readonly string[]>()
	expectTypeOf(scalar).toExtend<FieldDefinition<'boolean', boolean>>()
	expectTypeOf(dates).toExtend<FieldDefinition<'date', string>>()
	expectTypeOf(statuses).toExtend<
		FieldDefinition<'enum', 'draft' | 'published'>
	>()
	expectTypeOf(payloads).toExtend<FieldDefinition<'json', JsonValue>>()
	expectTypeOf<FieldValue<typeof matrix>>().toEqualTypeOf<
		readonly (readonly number[])[]
	>()
	expectTypeOf(matrix.options.default).toEqualTypeOf<
		readonly [readonly [1, 2]]
	>()
	expectTypeOf<FieldValue<typeof scalar>>().toEqualTypeOf<boolean>()
	expectTypeOf<FieldValue<typeof dates>>().toEqualTypeOf<readonly string[]>()
	expectTypeOf<FieldValue<typeof statuses>>().toEqualTypeOf<
		readonly ('draft' | 'published')[]
	>()
	expectTypeOf<FieldValue<typeof payloads>>().toEqualTypeOf<
		readonly JsonValue[]
	>()
	expectTypeOf<
		FieldListValue<string, readonly [true, true, true]>
	>().toEqualTypeOf<readonly (readonly (readonly string[])[])[]>()
})

test('infers object list values from reusable fields', () => {
	const fields = {
		name: stringField({
			validation: {
				required: true,
			},
		}),
		active: booleanField(),
		createdAt: dateField(),
		tags: stringField({ list: true }),
	}
	const field = objectField({
		typeName: 'Profile',
		fields,
		list: true,
	})

	interface ExpectedItem {
		readonly name: string
		readonly active: boolean
		readonly createdAt: string
		readonly tags: readonly string[]
	}

	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<
		readonly ExpectedItem[]
	>()
	expectTypeOf(field.options.fields.name.kind).toEqualTypeOf<'string'>()
	expectTypeOf(field.options.typeName).toEqualTypeOf<'Profile'>()
	expectTypeOf<ObjectFieldValue<typeof fields>>().toEqualTypeOf<ExpectedItem>()
	expectTypeOf<ObjectField>().toExtend<
		FieldDefinition<'object', Readonly<Record<string, unknown>>>
	>()
})

test('rejects invalid list declarations and structured defaults', () => {
	// @ts-expect-error -- List depth tuples cannot be empty.
	stringField({ list: [] })
	// @ts-expect-error -- List depth entries only describe list wrappers.
	stringField({ list: [true, false] })
	// @ts-expect-error -- List defaults must preserve the scalar field type.
	booleanField({ list: true, default: [true, 'false'] })
	// @ts-expect-error -- Nested list defaults must preserve every dimension.
	stringField({ list: [true, true], default: ['flat'] })
	// @ts-expect-error -- Object properties must be field definitions.
	objectField({
		fields: {
			name: 'string',
		},
	})
	// @ts-expect-error -- Neutral type identities must use strings.
	objectField({ typeName: 42, fields: {} })
	// @ts-expect-error -- Object defaults must use each child field value type.
	objectField({
		fields: {
			name: stringField(),
			active: booleanField(),
		},
		default: {
			name: 'fixture',
			active: 'yes',
		},
	})
	stringField({
		list: true,
		extensions: [
			// @ts-expect-error -- Schema extensions cannot attach to individual fields.
			defineSchemaExtension('fixture.list', {}),
		],
	})
})

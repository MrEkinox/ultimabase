import { expectTypeOf, test } from 'vitest'

import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	enumField,
	intField,
	jsonField,
	objectField,
	pointerField,
	relationField,
	stringField,
	type FieldDefinition,
	type FieldTypegenState,
	type FieldListValue,
	type FieldValue,
	type JsonDocument,
	type ObjectField,
	type ObjectFieldValue,
} from '../../index.js'
import { UltimaBase } from '../../../runtime/application/ultima-base.js'

test('infers one-dimensional list values', () => {
	const strings = stringField({
		list: true,
		default: ['first', 'second'],
	})
	const numbers = intField({ list: true, default: [1, 2] })
	const scalar = booleanField({ list: false })
	const dates = dateField({ list: true })
	const statuses = enumField({
		values: ['draft', 'published'],
		list: true,
	})
	const payloads = jsonField({ list: true })

	expectTypeOf(strings).toExtend<
		FieldDefinition<'string', string, object, FieldTypegenState>
	>()
	expectTypeOf(numbers).toExtend<
		FieldDefinition<'int', number, object, FieldTypegenState>
	>()
	expectTypeOf<FieldValue<typeof strings>>().toEqualTypeOf<readonly string[]>()
	expectTypeOf(scalar).toExtend<
		FieldDefinition<'boolean', boolean, object, FieldTypegenState>
	>()
	expectTypeOf(dates).toExtend<
		FieldDefinition<'date', string, object, FieldTypegenState>
	>()
	expectTypeOf(statuses).toExtend<
		FieldDefinition<'enum', 'draft' | 'published', object, FieldTypegenState>
	>()
	expectTypeOf(payloads).toExtend<
		FieldDefinition<'json', JsonDocument, object, FieldTypegenState>
	>()
	expectTypeOf<FieldValue<typeof numbers>>().toEqualTypeOf<readonly number[]>()
	expectTypeOf<FieldValue<typeof scalar>>().toEqualTypeOf<boolean>()
	expectTypeOf<FieldValue<typeof dates>>().toEqualTypeOf<readonly string[]>()
	expectTypeOf<FieldValue<typeof statuses>>().toEqualTypeOf<
		readonly ('draft' | 'published')[]
	>()
	expectTypeOf<FieldValue<typeof payloads>>().toEqualTypeOf<
		readonly JsonDocument[]
	>()
	expectTypeOf<FieldListValue<string, true>>().toEqualTypeOf<
		readonly string[]
	>()
})

test('infers object list values from reusable fields', () => {
	const fields = {
		name: stringField({
			required: true,
		}),
		active: booleanField(),
		createdAt: dateField(),
		avatar: binaryField(),
		tags: stringField({ list: true }),
	}
	const field = objectField({
		typeName: 'Profile',
		fields,
		list: true,
	})

	interface ExpectedItem {
		readonly name: string
		readonly active: boolean | null
		readonly createdAt: string | null
		readonly avatar: Uint8Array | null
		readonly tags: readonly string[] | null
	}

	expectTypeOf<FieldValue<typeof field>>().toEqualTypeOf<
		readonly ExpectedItem[]
	>()
	expectTypeOf(field.options.fields.name.kind).toEqualTypeOf<'string'>()
	expectTypeOf(field.options.typeName).toEqualTypeOf<string | undefined>()
	expectTypeOf<ObjectFieldValue<typeof fields>>().toEqualTypeOf<ExpectedItem>()
	expectTypeOf<ObjectField>().toExtend<
		FieldDefinition<
			'object',
			Readonly<Record<string, unknown>>,
			ObjectField['options'],
			FieldTypegenState
		>
	>()
})

test('rejects invalid list declarations and structured defaults', () => {
	// @ts-expect-error -- List depth tuples cannot be empty.
	stringField({ list: [] })
	// @ts-expect-error -- List depth entries only describe list wrappers.
	stringField({ list: [true, false] })
	// @ts-expect-error -- Multidimensional values belong in jsonField.
	stringField({ list: [true, true] })
	// @ts-expect-error -- List defaults must preserve the scalar field type.
	booleanField({ list: true, default: [true, 'false'] })
	objectField({
		fields: {
			// @ts-expect-error -- Object properties must be field definitions.
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
	objectField({
		fields: {
			optional: stringField(),
			required: stringField({ required: true }),
		},
		// @ts-expect-error -- Required create inputs cannot be omitted from defaults.
		default: {},
	})
	stringField({
		list: true,
		// @ts-expect-error -- Removed generic extension metadata is not a field option.
		extensions: [],
	})
})

test('rejects schema targets inside embedded objects', () => {
	const Target = UltimaBase.Schema.define({
		className: 'EmbeddedObjectTarget',
		fields: (field) => ({ name: field.string() }),
	})

	objectField({
		fields: {
			// @ts-expect-error -- Embedded JSONB values cannot own pointer semantics.
			author: pointerField({ target: () => Target }),
		},
	})
	objectField({
		fields: {
			// @ts-expect-error -- Relations require a top-level schema identity.
			tags: relationField({ target: () => Target }),
		},
	})
})

test('rejects database-generated sequences inside embedded objects', () => {
	objectField({
		fields: {
			// @ts-expect-error -- A PostgreSQL sequence requires its own column.
			sequence: intField({ autoIncrement: true }),
		},
	})
	objectField({
		fields: {
			// @ts-expect-error -- A PostgreSQL sequence cannot generate one JSONB property.
			largeSequence: bigintField({ autoIncrement: true }),
		},
	})
})

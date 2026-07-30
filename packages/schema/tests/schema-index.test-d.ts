import { expectTypeOf, test } from 'vitest'

import {
	defineSchema,
	stringField,
	type SchemaIndexDefinition,
	type SchemaIndexOptions,
} from '../src/index.js'

test('checks composite fields and exposes one normalized index type', () => {
	const schema = defineSchema({
		className: 'Post',
		fields: {
			authorId: stringField(),
			slug: stringField({ indexed: 'unique' }),
		},
		indexes: [
			{ fields: ['authorId', 'createdAt'] },
			{ fields: ['authorId', 'slug'], unique: true },
		],
	})

	type FieldName = 'authorId' | 'createdAt' | 'id' | 'slug' | 'updatedAt'

	expectTypeOf(schema.indexes).toEqualTypeOf<
		readonly SchemaIndexDefinition<FieldName>[]
	>()
	expectTypeOf(schema.indexes[0]?.unique).toEqualTypeOf<boolean | undefined>()
	expectTypeOf<SchemaIndexOptions<FieldName>>().toExtend<{
		readonly fields: readonly [FieldName, FieldName, ...FieldName[]]
		readonly unique?: boolean
	}>()
})

test('rejects invalid composite declarations statically', () => {
	defineSchema({
		className: 'UnknownField',
		fields: {
			title: stringField(),
		},
		indexes: [
			// @ts-expect-error -- Composite index fields must exist in the schema.
			{ fields: ['title', 'missing'] },
		],
	})

	defineSchema({
		className: 'ShortIndex',
		fields: {
			title: stringField(),
		},
		indexes: [
			// @ts-expect-error -- Single-field indexes belong on the field definition.
			{ fields: ['title'] },
		],
	})

	defineSchema({
		className: 'InvalidUnique',
		fields: {
			slug: stringField(),
			title: stringField(),
		},
		indexes: [
			{
				fields: ['slug', 'title'],
				// @ts-expect-error -- Index uniqueness is a boolean.
				unique: 'yes',
			},
		],
	})
})

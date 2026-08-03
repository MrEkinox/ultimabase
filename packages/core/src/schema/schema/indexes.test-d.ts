import { expectTypeOf, test } from 'vitest'

import {
	relationField,
	Schema,
	stringField,
	type SchemaIndexDefinition,
	type SchemaIndexOptions,
} from '../index.js'

test('checks composite fields and exposes one normalized index type', () => {
	const schema = Schema.define({
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
	const RelationTarget = Schema.define({
		className: 'IndexRelationTarget',
		fields: {},
	})

	Schema.define({
		className: 'UnknownField',
		fields: {
			title: stringField(),
		},
		indexes: [
			// @ts-expect-error -- Composite index fields must exist in the schema.
			{ fields: ['title', 'missing'] },
		],
	})

	Schema.define({
		className: 'ShortIndex',
		fields: {
			title: stringField(),
		},
		indexes: [
			// @ts-expect-error -- Single-field indexes belong on the field definition.
			{ fields: ['title'] },
		],
	})

	Schema.define({
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

	Schema.define({
		className: 'RelationIndex',
		fields: {
			title: stringField(),
			targets: relationField({ target: () => RelationTarget }),
		},
		indexes: [
			// @ts-expect-error -- Relation handles have no source-table column to index.
			{ fields: ['title', 'targets'] },
		],
	})
})

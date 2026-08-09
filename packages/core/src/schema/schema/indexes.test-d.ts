import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	type SchemaIndexDefinition,
	type SchemaIndexOptions,
} from '../index.js'

test('checks composite fields and exposes one normalized index type', () => {
	const schema = Schema.define({
		className: 'Post',
		fields: (field) => ({
			authorId: field.string(),
			slug: field.string({ indexed: 'unique' }),
		}),
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
		fields: () => ({}),
	})

	Schema.define({
		className: 'UnknownField',
		fields: (field) => ({
			title: field.string(),
		}),
		indexes: [
			// @ts-expect-error -- Composite index fields must exist in the schema.
			{ fields: ['title', 'missing'] },
		],
	})

	Schema.define({
		className: 'ShortIndex',
		fields: (field) => ({
			title: field.string(),
		}),
		indexes: [
			// @ts-expect-error -- Single-field indexes belong on the field definition.
			{ fields: ['title'] },
		],
	})

	Schema.define({
		className: 'InvalidUnique',
		fields: (field) => ({
			slug: field.string(),
			title: field.string(),
		}),
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
		fields: (field) => ({
			title: field.string(),
			targets: field.relation({ target: () => RelationTarget }),
		}),
		indexes: [
			// @ts-expect-error -- Relation handles have no source-table column to index.
			{ fields: ['title', 'targets'] },
		],
	})
})

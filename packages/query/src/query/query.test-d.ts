import {
	booleanField,
	defineSchema,
	enumField,
	intField,
	objectField,
	stringField,
} from '@ultimabase/schema'
import { expect, expectTypeOf, test } from 'vitest'

import {
	Query,
	type QueryFilterFieldName,
	type QueryFilterNode,
} from '../index.js'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField(),
		views: intField(),
		score: intField({ validation: { nullable: true } }),
		status: enumField({ values: ['draft', 'published'] }),
		aliases: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
	},
})

test('preserves schema, AST, and chain result types', () => {
	const query = new Query(postSchema)
		.equalTo('published', true)
		.greaterThan('views', 10)
		.select('title', 'id')
		.descending('createdAt')
		.limit(25)
		.after('opaque.cursor')

	expect(query.schema.className).toBe('Post')
	expectTypeOf(query).toEqualTypeOf<Query<typeof postSchema, 'title' | 'id'>>()
	expectTypeOf(query.ast.schema.definition).toEqualTypeOf<typeof postSchema>()
	expectTypeOf(query.ast.where?.expression).toEqualTypeOf<
		QueryFilterNode<typeof postSchema> | undefined
	>()
	expectTypeOf<
		QueryFilterFieldName<typeof postSchema, 'greater-than'>
	>().toEqualTypeOf<'title' | 'views' | 'score' | 'createdAt' | 'updatedAt'>()
	expectTypeOf<'find'>().not.toExtend<keyof typeof query>()
	expectTypeOf<'save'>().not.toExtend<keyof typeof query>()
	expectTypeOf<'bind'>().toExtend<keyof typeof query>()

	// @ts-expect-error -- Public AST roots remain immutable.
	query.ast.limit = 50
})

test('correlates every filter field with its exact operand type', () => {
	const query = new Query(postSchema)

	query.equalTo('published', true)
	query.equalTo('score', null)
	query.notEqualTo('status', 'draft')
	query.greaterThan('views', 10)
	query.greaterThanOrEqualTo('views', 10)
	query.lessThan('views', 100)
	query.lessThanOrEqualTo('views', 100)
	query.containedIn('status', ['draft', 'published'])
	query.notContainedIn('status', ['draft'])
	query.contains('title', 'Base')
	query.startsWith('title', 'Ultima')
	query.endsWith('title', 'Base')
	query.matches('title', { source: '^Ultima', flags: ['case-insensitive'] })
	query.exists('metadata')
	query.doesNotExist('aliases')

	// @ts-expect-error -- Boolean operands remain booleans.
	query.equalTo('published', 'true')
	// @ts-expect-error -- Enum operands remain their exact literal union.
	query.equalTo('status', 'archived')
	// @ts-expect-error -- Ordered comparisons reject boolean fields.
	query.greaterThan('published', true)
	// @ts-expect-error -- Ordered comparisons reject nullable null operands.
	query.greaterThan('score', null)
	// @ts-expect-error -- Membership values stay correlated with the enum.
	query.containedIn('status', ['archived'])
	// @ts-expect-error -- String operators reject numeric fields.
	query.contains('views', '10')
	// @ts-expect-error -- Regex filters reject non-string fields.
	query.matches('views', { source: '10', flags: [] })
	// @ts-expect-error -- Equality does not apply to list fields.
	query.equalTo('aliases', ['alias'])
})

test('restricts fields, pagination values, and logical schemas', () => {
	const query = new Query(postSchema)
	const commentSchema = defineSchema({
		className: 'Comment',
		fields: { body: stringField() },
	})

	query.select('title', 'createdAt').ascending('title').descending('views')
	query.limit(25)
	query.skip(50)
	query.after('opaque.cursor')
	query.and(new Query(postSchema).equalTo('published', true))
	query.or(new Query(postSchema).equalTo('published', false))
	query.not(new Query(postSchema).exists('title'))

	// @ts-expect-error -- Selection is restricted to schema fields.
	query.select('missing')
	// @ts-expect-error -- Ordering is restricted to schema fields.
	query.ascending('missing')
	// @ts-expect-error -- Limit requires a number.
	query.limit('25')
	// @ts-expect-error -- Offset requires a number.
	query.skip('50')
	// @ts-expect-error -- Cursors require opaque strings at the input boundary.
	query.after(42)
	// @ts-expect-error -- Logical combinations retain the exact schema type.
	query.and(new Query(commentSchema).equalTo('body', 'Comment'))

	expect(query.ast.kind).toBe('query')
})

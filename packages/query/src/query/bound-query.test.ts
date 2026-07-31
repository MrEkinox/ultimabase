import {
	booleanField,
	defineSchema,
	intField,
	stringField,
} from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { BoundQuery } from './bound-query.js'
import { Query } from './query.js'

const articleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField(),
		published: booleanField(),
		views: intField(),
	},
})

describe('BoundQuery', () => {
	it('preserves one engine across immutable query branches', () => {
		const engine = { name: 'request-engine' } as const
		const unbound = new Query(articleSchema)
		const base = unbound.bind(engine)
		const selected = base
			.equalTo('published', true)
			.select('id', 'title')
			.descending('createdAt')
			.limit(10)

		expect(selected).not.toBe(base)
		expect(selected.engine).toBe(engine)
		expect(base.unbound).toBe(unbound)
		expect(selected.schema).toBe(articleSchema)
		expect(selected.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'id' },
			{ kind: 'selected-field', field: 'title' },
		])
		expect(selected.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'published',
			value: true,
		})
		expect(base.ast.selection.fields).toStrictEqual([])
		expect(unbound.ast.where).toBeUndefined()
		expect(Object.isFrozen(base)).toBe(true)
		expect(Object.isFrozen(selected)).toBe(true)
	})

	it('delegates the complete Query builder surface to bound branches', () => {
		const engine = { name: 'request-engine' } as const
		const reusable = new Query(articleSchema).equalTo('published', true)
		const query = new Query(articleSchema)
			.bind(engine)
			.notEqualTo('published', false)
			.greaterThan('views', 1)
			.greaterThanOrEqualTo('views', 2)
			.lessThan('views', 100)
			.lessThanOrEqualTo('views', 99)
			.containedIn('views', [2, 3])
			.notContainedIn('views', [0])
			.contains('title', 'Base')
			.startsWith('title', 'Ultima')
			.endsWith('title', 'Base')
			.matches('title', { source: '^Ultima', flags: [] })
			.exists('title')
			.doesNotExist('views')
			.and(reusable)
			.or(reusable)
			.not(reusable)
			.ascending('title')
			.skip(5)
		const cursor = new Query(articleSchema).bind(engine).after('cursor')

		expect(query.ast.where?.expression.kind).toBe('and')
		expect(query.ast.ordering.orders).toStrictEqual([
			{ kind: 'order', field: 'title', direction: 'ascending' },
		])
		expect(query.ast.pagination).toStrictEqual({
			kind: 'offset-pagination',
			skip: 5,
		})
		expect(cursor.ast.pagination).toStrictEqual({
			kind: 'cursor-pagination',
			after: 'cursor',
		})
		expect(query.engine).toBe(engine)
	})

	it('retains reusable logical filters without adopting their clauses', () => {
		const engine = { name: 'request-engine' } as const
		const reusable = new Query(articleSchema)
			.equalTo('published', true)
			.limit(5)
		const bound = new BoundQuery(new Query(articleSchema).limit(20), engine)
		const combined = bound.and(reusable)

		expect(combined.ast.where?.expression).toBe(reusable.ast.where?.expression)
		expect(combined.ast.limit).toBe(20)
		expect(combined.engine).toBe(engine)
	})
})

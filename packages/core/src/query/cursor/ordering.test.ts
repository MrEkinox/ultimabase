import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { normalizeQueryCursorOrdering } from './ordering.js'

const postSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
	}),
})

describe('normalizeQueryCursorOrdering', () => {
	it('adds the primary key with a deterministic direction', () => {
		expect(normalizeQueryCursorOrdering(postSchema, [])).toStrictEqual({
			kind: 'ordering',
			orders: [{ kind: 'order', field: 'id', direction: 'ascending' }],
		})
		expect(
			normalizeQueryCursorOrdering(postSchema, [
				{ field: 'title', direction: 'descending' },
			]),
		).toStrictEqual({
			kind: 'ordering',
			orders: [
				{ kind: 'order', field: 'title', direction: 'descending' },
				{ kind: 'order', field: 'id', direction: 'descending' },
			],
		})
	})

	it('moves an explicit primary key last while preserving its direction', () => {
		const orders = [
			{ field: 'id', direction: 'ascending' },
			{ field: 'createdAt', direction: 'descending' },
		] as const
		const ordering = normalizeQueryCursorOrdering(postSchema, orders)

		expect(ordering).toStrictEqual({
			kind: 'ordering',
			orders: [
				{ kind: 'order', field: 'createdAt', direction: 'descending' },
				{ kind: 'order', field: 'id', direction: 'ascending' },
			],
		})
		expect(orders[0]).toStrictEqual({
			field: 'id',
			direction: 'ascending',
		})
		expect(Object.isFrozen(ordering)).toBe(true)
		expect(Object.isFrozen(ordering.orders)).toBe(true)
		expect(Object.isFrozen(ordering.orders[0])).toBe(true)
	})
})

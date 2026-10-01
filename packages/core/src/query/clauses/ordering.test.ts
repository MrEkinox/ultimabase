import { describe, expect, it } from 'vitest'

import { normalizeQueryOrdering } from './ordering.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const postSchema = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		published: field.boolean({ default: false }),
	}),
})

describe('normalizeQueryOrdering', () => {
	it('keeps first priority and replaces duplicate field directions', () => {
		const orders = [
			{ field: 'title', direction: 'ascending' },
			{ field: 'createdAt', direction: 'descending' },
			{ field: 'title', direction: 'descending' },
		] as const
		const ordering = normalizeQueryOrdering(postSchema, orders)

		expect(ordering).toStrictEqual({
			kind: 'ordering',
			orders: [
				{ kind: 'order', field: 'title', direction: 'descending' },
				{ kind: 'order', field: 'createdAt', direction: 'descending' },
			],
		})
		expect(orders[0]).toStrictEqual({
			field: 'title',
			direction: 'ascending',
		})
	})

	it('freezes normalized nodes and shares the immutable empty ordering', () => {
		const firstEmpty = normalizeQueryOrdering(postSchema, [])
		const secondEmpty = normalizeQueryOrdering(postSchema, [])
		const ordering = normalizeQueryOrdering(postSchema, [
			{ field: 'title', direction: 'ascending' },
		])

		expect(firstEmpty).toBe(secondEmpty)
		expect(Object.isFrozen(firstEmpty)).toBe(true)
		expect(Object.isFrozen(firstEmpty.orders)).toBe(true)
		expect(Object.isFrozen(ordering)).toBe(true)
		expect(Object.isFrozen(ordering.orders)).toBe(true)
		expect(Object.isFrozen(ordering.orders[0])).toBe(true)
	})

	it('rejects malformed order clauses at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeQueryOrdering(postSchema, null)
		}).toThrow(new TypeError('query orders must be an array'))
		expect(() => {
			// @ts-expect-error -- Runtime normalization validates every order item.
			normalizeQueryOrdering(postSchema, [null])
		}).toThrow(new TypeError('query.orders[0] must be an object'))
		expect(() => {
			normalizeQueryOrdering(postSchema, [
				// @ts-expect-error -- Source typing rejects unknown fields; Runtime also protects JavaScript callers.
				{ field: 'missing', direction: 'ascending' },
			])
		}).toThrow(
			new TypeError('query.orders[0].field must reference a schema field'),
		)
		expect(() => {
			normalizeQueryOrdering(postSchema, [
				// @ts-expect-error -- Runtime normalization validates order directions.
				{ field: 'title', direction: 'sideways' },
			])
		}).toThrow(
			new TypeError(
				'query.orders[0].direction must be ascending or descending',
			),
		)
	})
})

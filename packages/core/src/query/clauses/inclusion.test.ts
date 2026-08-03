import { pointerField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { Query } from '../query/query.js'
import { normalizeQueryInclusion } from './inclusion.js'

const userSchema = Schema.define({
	className: 'IncludedUser',
	fields: { name: stringField(), email: stringField() },
})
const otherSchema = Schema.define({ className: 'OtherTarget', fields: {} })
const postSchema = Schema.define({
	className: 'IncludedPost',
	fields: {
		author: pointerField({ target: () => userSchema }),
		reviewer: pointerField({ target: () => userSchema }),
		title: stringField(),
	},
})

describe('normalizeQueryInclusion', () => {
	it('keeps first field order while the last duplicate target query wins', () => {
		const firstAuthor = new Query(userSchema).select('id')
		const reviewer = new Query(userSchema).select('name')
		const finalAuthor = new Query(userSchema)
			.select('id', 'email')
			.endsWith('email', '@example.com')
		const inclusion = normalizeQueryInclusion(postSchema, [
			{ field: 'author', query: firstAuthor.ast },
			{ field: 'reviewer', query: reviewer.ast },
			{ field: 'author', query: finalAuthor.ast },
		])

		expect(inclusion.pointers.map(({ field }) => field)).toStrictEqual([
			'author',
			'reviewer',
		])
		expect(inclusion.pointers[0]?.query).toBe(finalAuthor.ast)
		expect(inclusion.pointers[1]?.query).toBe(reviewer.ast)
		expect(Object.isFrozen(inclusion)).toBe(true)
		expect(Object.isFrozen(inclusion.pointers)).toBe(true)
		expect(Object.isFrozen(inclusion.pointers[0])).toBe(true)
	})

	it('rejects non-pointer fields and queries for another target', () => {
		expect(() =>
			normalizeQueryInclusion(postSchema, [
				// @ts-expect-error -- Runtime validation protects transport normalizers.
				{ field: 'title', query: new Query(userSchema).ast },
			]),
		).toThrow(
			new TypeError('query inclusion field must reference a pointer field'),
		)
		expect(() =>
			normalizeQueryInclusion(postSchema, [
				{
					field: 'author',
					// @ts-expect-error -- Runtime identity checks complement target inference.
					query: new Query(otherSchema).ast,
				},
			]),
		).toThrow(
			new TypeError(
				'query inclusion author must use target schema IncludedUser',
			),
		)
	})
})

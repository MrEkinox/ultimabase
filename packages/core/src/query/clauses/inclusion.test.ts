import { pointerField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../query/query.js'
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
		const firstAuthor = new QueryBuilder(userSchema).select({ id: true })
		const reviewer = new QueryBuilder(userSchema).select({ name: true })
		const finalAuthor = new QueryBuilder(userSchema)
			.select({ id: true, email: true })
			.where((where) => where.endsWith('email', '@example.com'))
		const inclusion = normalizeQueryInclusion(postSchema, [
			{ field: 'author', query: firstAuthor.ast },
			{ field: 'reviewer', query: reviewer.ast },
			{ field: 'author', query: finalAuthor.ast },
		])

		expect(inclusion.fields.map(({ field }) => field)).toStrictEqual([
			'author',
			'reviewer',
		])
		expect(inclusion.fields[0]?.query).toBe(finalAuthor.ast)
		expect(inclusion.fields[1]?.query).toBe(reviewer.ast)
		expect(Object.isFrozen(inclusion)).toBe(true)
		expect(Object.isFrozen(inclusion.fields)).toBe(true)
		expect(Object.isFrozen(inclusion.fields[0])).toBe(true)
	})

	it('rejects non-pointer fields and queries for another target', () => {
		expect(() =>
			normalizeQueryInclusion(postSchema, [
				// @ts-expect-error -- Runtime validation protects transport normalizers.
				{ field: 'title', query: new QueryBuilder(userSchema).ast },
			]),
		).toThrow(
			new TypeError(
				'query inclusion field must reference a pointer or relation field',
			),
		)
		expect(() =>
			normalizeQueryInclusion(postSchema, [
				{
					field: 'author',
					// @ts-expect-error -- Runtime identity checks complement target inference.
					query: new QueryBuilder(otherSchema).ast,
				},
			]),
		).toThrow(
			new TypeError(
				'query inclusion author must use target schema IncludedUser',
			),
		)
	})
})

import { pointerField, SchemaRegistry } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../query/query.js'
import { normalizeQueryInclusion } from './inclusion.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const userSchema = UltimaBase.Schema.define({
	className: 'IncludedUser',
	fields: (field) => ({ name: field.string(), email: field.string() }),
})
const otherSchema = UltimaBase.Schema.define({
	className: 'OtherTarget',
	fields: () => ({}),
})
const postSchema = UltimaBase.Schema.define({
	className: 'IncludedPost',
	fields: (field) => ({
		author: field.pointer({ target: 'IncludedUser' }),
		reviewer: field.pointer({ target: 'IncludedUser' }),
		title: field.string(),
	}),
})

new SchemaRegistry([userSchema, otherSchema, postSchema]).resolveSchemaTargets()

describe('normalizeQueryInclusion', () => {
	it('keeps first field order while the last duplicate target query wins', () => {
		const firstAuthor = new QueryBuilder(userSchema).select({ id: true })
		const reviewer = new QueryBuilder(userSchema).select({ name: true })
		const finalAuthor = new QueryBuilder(userSchema)
			.select({ id: true, email: true })
			.where((where) => where.endsWith('email', '@example.com'))
		// This internal normalizer fixture checks Runtime target identity and order;
		// the public include callback carries the exact target type separately.
		const inclusion = normalizeQueryInclusion(postSchema, [
			{ field: 'author', query: firstAuthor.ast },
			{ field: 'reviewer', query: reviewer.ast },
			{ field: 'author', query: finalAuthor.ast },
		] as never)

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
				{ field: 'title', query: new QueryBuilder(userSchema).ast },
			] as never),
		).toThrow(
			new TypeError(
				'query inclusion field must reference a pointer or relation field',
			),
		)
		expect(() =>
			normalizeQueryInclusion(postSchema, [
				{
					field: 'author',
					query: new QueryBuilder(otherSchema).ast,
				},
			] as never),
		).toThrow(
			new TypeError(
				'query inclusion author must use target schema IncludedUser',
			),
		)
	})

	it('reuses normalized inputs without mutating branches or hiding invalid duplicates', () => {
		const firstQuery = new QueryBuilder(userSchema).select({ name: true })
		const replacement = new QueryBuilder(userSchema).select({ email: true })
		const first = normalizeQueryInclusion(postSchema, [
			{ field: 'author', query: firstQuery.ast },
			{ field: 'reviewer', query: firstQuery.ast },
		] as never)
		const second = normalizeQueryInclusion(postSchema, [
			...first.fields,
			{ field: 'author', query: replacement.ast },
		] as never)

		expect(first.fields[0]?.query).toBe(firstQuery.ast)
		expect(second.fields.map(({ field }) => field)).toStrictEqual([
			'author',
			'reviewer',
		])
		expect(second.fields[0]?.query).toBe(replacement.ast)
		expect(() =>
			normalizeQueryInclusion(postSchema, [
				{ field: 'author', query: new QueryBuilder(otherSchema).ast },
				...second.fields,
			] as never),
		).toThrow('query inclusion author must use target schema IncludedUser')
	})

	it('rejects relationship fields without a schema target', () => {
		const malformedSchema = UltimaBase.Schema.define({
			className: 'MalformedInclusionTarget',
			fields: () => ({
				broken: pointerField({ target: () => ({}) as never }),
			}),
		})

		expect(() =>
			normalizeQueryInclusion(malformedSchema, [
				{
					field: 'broken',
					query: new QueryBuilder(userSchema).ast,
				},
			] as never),
		).toThrow(
			new TypeError(
				'query inclusion target must be created by App.Schema.define',
			),
		)
	})
})

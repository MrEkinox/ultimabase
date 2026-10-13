import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../../schema/index.js'
import {
	queryFromCountInput,
	queryFromFindManyInput,
	queryFromFindOneInput,
	queryFromGetInput,
} from './input.js'
import { QueryBuilder } from './query.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Author = UltimaBase.Schema.define({
	className: 'ReadInputAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
	}),
})

const Post = UltimaBase.Schema.define({
	className: 'ReadInputPost',
	fields: (field) => ({
		author: field.pointer({
			target: 'ReadInputAuthor',
			required: true,
		}),
		title: field.string({ required: true }),
	}),
})

const Feed = UltimaBase.Schema.define({
	className: 'ReadInputFeed',
	fields: (field) => ({
		name: field.string(),
		posts: field.relation({ target: 'ReadInputPost' }),
	}),
})

const Subscription = UltimaBase.Schema.define({
	className: 'ReadInputSubscription',
	fields: (field) => ({
		feed: field.pointer({ target: 'ReadInputFeed' }),
	}),
})

new SchemaRegistry([Author, Post, Feed, Subscription]).resolveSchemaTargets()

describe('canonical read inputs', () => {
	it('normalizes one complete object directly into an immutable Query AST', () => {
		const query = queryFromFindManyInput(Post, {
			include: {
				author: {
					select: { id: true, name: true },
				},
			},
			take: 20,
			skip: 10,
			orderBy: { createdAt: 'desc', id: 'asc' },
			select: { id: true, title: true },
			where: { title: { contains: 'TypeScript' } },
		})

		expect(query).not.toBeInstanceOf(QueryBuilder)
		expect(Object.isFrozen(query)).toBe(true)
		expect(query.ast).toMatchObject({
			take: 20,
			ordering: {
				orders: [
					{ direction: 'descending', field: 'createdAt' },
					{ direction: 'ascending', field: 'id' },
				],
			},
			pagination: { kind: 'skip-pagination', skip: 10 },
			selection: {
				fields: [
					{ field: 'id', kind: 'selected-field' },
					{ field: 'title', kind: 'selected-field' },
					{ field: 'author', kind: 'selected-field' },
				],
			},
		})
		expect(query.ast.inclusion.fields[0]).toMatchObject({
			field: 'author',
			query: {
				selection: {
					fields: [
						{ field: 'id', kind: 'selected-field' },
						{ field: 'name', kind: 'selected-field' },
					],
				},
			},
		})
	})

	it('normalizes bounded relation includes without selecting a stored source field', () => {
		const query = queryFromFindManyInput(Feed, {
			select: { name: true },
			include: {
				posts: {
					where: { title: { contains: 'TypeScript' } },
					orderBy: { createdAt: 'desc' },
					take: 3,
					skip: 2,
					select: { title: true },
				},
			},
		})

		expect(query.ast.selection.fields).toStrictEqual([
			{ field: 'name', kind: 'selected-field' },
			{ field: 'id', kind: 'selected-field' },
		])
		expect(query.ast.inclusion.fields[0]).toMatchObject({
			field: 'posts',
			kind: 'included-relation',
			query: {
				take: 3,
				pagination: { kind: 'skip-pagination', skip: 2 },
				ordering: {
					// Included collections are completed by `id` too (ADR-0309).
					orders: [
						{ direction: 'descending', field: 'createdAt' },
						{ direction: 'ascending', field: 'id' },
					],
				},
				selection: { fields: [{ field: 'title' }, { field: 'id' }] },
				where: {
					expression: {
						field: 'title',
						kind: 'contains',
						value: 'TypeScript',
					},
				},
			},
		})
	})

	// ADR-0309 step 3b amendment: an included collection pages by position.
	it('turns an included relation `after` into a position filter per parent', () => {
		const after = {
			createdAt: '2026-10-10T10:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000001',
		}
		const query = queryFromFindManyInput(Feed, {
			include: {
				posts: { orderBy: { createdAt: 'desc' }, take: 2, after },
			},
		})
		const included = query.ast.inclusion.fields[0]

		expect(included).toMatchObject({
			field: 'posts',
			query: {
				take: 2,
				ordering: {
					orders: [
						{ direction: 'descending', field: 'createdAt' },
						{ direction: 'ascending', field: 'id' },
					],
				},
				where: { expression: { kind: 'or' } },
			},
		})
		expect(() =>
			queryFromFindManyInput(Feed, {
				include: { posts: { after, skip: 1 } },
			}),
		).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				publicDetails: { parameter: 'after' },
			}),
		)
		expect(() =>
			queryFromFindManyInput(Feed, {
				include: {
					posts: { orderBy: { title: 'asc' }, after: { id: after.id } },
				},
			}),
		).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				publicDetails: { parameter: 'after' },
			}),
		)
	})

	it('keeps operation-specific inputs free of irrelevant clauses', () => {
		expect(() => queryFromFindManyInput(Post, { offset: 10 } as never)).toThrow(
			'find-many input contains an unknown clause: offset',
		)
		expect(() =>
			queryFromCountInput(Post, { select: { id: true } } as never),
		).toThrow('count input contains an unknown clause: select')
		expect(() => queryFromFindOneInput(Post, { take: 1 } as never)).toThrow(
			'find-one input contains an unknown clause: take',
		)
		expect(() =>
			queryFromFindManyInput(Post, {
				include: {
					author: { orderBy: { name: 'asc' } },
				},
			} as never),
		).toThrow('pointer-target input contains an unknown clause: orderBy')
		expect(() =>
			queryFromFindManyInput(Post, {
				include: {
					author: { where: { name: { startsWith: 'A' } } },
				},
			} as never),
		).toThrow('pointer-target input contains an unknown clause: where')
		expect(() =>
			queryFromFindManyInput(Feed, {
				include: { posts: { limit: 10 } },
			} as never),
		).toThrow('relation-target input contains an unknown clause: limit')
		expect(() => queryFromGetInput(Post, {} as never)).toThrow(
			'get input id must be a string',
		)
		expect(() => queryFromGetInput(Post, { id: 42 } as never)).toThrow(
			'get input id must be a string',
		)
		expect(() =>
			queryFromFindManyInput(Post, {
				include: { title: {} },
			} as never),
		).toThrow(
			'query inclusion field must reference a pointer or relation field',
		)
	})

	it('normalizes object ordering and rejects invalid values and clauses', () => {
		expect(
			queryFromFindManyInput(Post, {
				orderBy: { createdAt: 'desc', id: null, title: 'asc' },
			}).ast.ordering.orders,
		).toStrictEqual([
			{ direction: 'descending', field: 'createdAt', kind: 'order' },
			{ direction: 'ascending', field: 'title', kind: 'order' },
			// A collection read always ends with `id` (ADR-0309).
			{ direction: 'ascending', field: 'id', kind: 'order' },
		])
		expect(() =>
			queryFromFindManyInput(Post, {
				orderBy: [{ createdAt: 'desc' }],
			} as never),
		).toThrow('query.orderBy must be an object')
		expect(() =>
			queryFromFindManyInput(Post, {
				orderBy: { createdAt: 'sideways' },
			} as never),
		).toThrow('query.orderBy.createdAt must be asc, desc, or null')
		expect(() =>
			queryFromFindManyInput(Post, {
				cursor: true,
			} as never),
		).toThrow('find-many input contains an unknown clause: cursor')
	})

	it('rejects a relation in every read selection before execution', () => {
		const relation = new TypeError(
			'selection.posts must not reference a relation; read relations through include',
		)

		for (const read of [
			() =>
				queryFromFindOneInput(Feed, {
					select: { name: true, posts: true } as never,
				}),
			() => queryFromFindManyInput(Feed, { select: { posts: true } as never }),
			() =>
				queryFromFindOneInput(Subscription, {
					include: { feed: { select: { posts: true } as never } },
				}),
		]) {
			expect(read).toThrow(relation)
		}
		// Exclusion mode leaves the relation out instead of selecting it.
		expect(
			queryFromFindOneInput(Feed, { select: { name: false } }).ast.selection
				.fields,
		).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
			{ field: 'createdAt', kind: 'selected-field' },
			{ field: 'updatedAt', kind: 'selected-field' },
		])
	})
})

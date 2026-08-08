import { describe, expect, it } from 'vitest'

import {
	pointerField,
	relationField,
	Schema,
	stringField,
} from '../../schema/index.js'
import {
	queryFromCountInput,
	queryFromFindManyInput,
	queryFromFindOneInput,
	queryFromGetInput,
} from './input.js'
import { QueryBuilder } from './query.js'

const Author = Schema.define({
	className: 'ReadInputAuthor',
	fields: { name: stringField({ validation: { required: true } }) },
})

const Post = Schema.define({
	className: 'ReadInputPost',
	fields: {
		author: pointerField({
			target: () => Author,
			validation: { required: true },
		}),
		title: stringField({ validation: { required: true } }),
	},
})

const Feed = Schema.define({
	className: 'ReadInputFeed',
	fields: {
		name: stringField(),
		posts: relationField({ target: () => Post }),
	},
})

describe('canonical read inputs', () => {
	it('normalizes one complete object directly into an immutable Query AST', () => {
		const query = queryFromFindManyInput(Post, {
			cursor: 'cursor',
			include: {
				author: {
					select: { id: true, name: true },
				},
			},
			limit: 20,
			orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
			select: { id: true, title: true },
			where: { title: { contains: 'TypeScript' } },
		})

		expect(query).not.toBeInstanceOf(QueryBuilder)
		expect(Object.isFrozen(query)).toBe(true)
		expect(query.ast).toMatchObject({
			limit: 20,
			ordering: {
				orders: [
					{ direction: 'descending', field: 'createdAt' },
					{ direction: 'ascending', field: 'id' },
				],
			},
			pagination: { after: 'cursor', kind: 'cursor-pagination' },
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
					orderBy: [{ createdAt: 'desc' }],
					limit: 3,
					offset: 2,
					select: { title: true },
				},
			},
		})

		expect(query.ast.selection.fields).toStrictEqual([
			{ field: 'name', kind: 'selected-field' },
		])
		expect(query.ast.inclusion.fields[0]).toMatchObject({
			field: 'posts',
			kind: 'included-relation',
			query: {
				limit: 3,
				pagination: { kind: 'offset-pagination', offset: 2 },
				ordering: {
					orders: [{ direction: 'descending', field: 'createdAt' }],
				},
				selection: { fields: [{ field: 'title' }] },
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

	it('keeps operation-specific inputs free of irrelevant clauses', () => {
		expect(() => queryFromFindManyInput(Post, { skip: 10 } as never)).toThrow(
			'find-many input contains an unknown clause: skip',
		)
		expect(() =>
			queryFromCountInput(Post, { select: { id: true } } as never),
		).toThrow('count input contains an unknown clause: select')
		expect(() => queryFromFindOneInput(Post, { limit: 1 } as never)).toThrow(
			'find-one input contains an unknown clause: limit',
		)
		expect(() =>
			queryFromFindManyInput(Post, {
				include: {
					author: { orderBy: [{ name: 'asc' }] },
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
				include: { posts: { skip: 10 } },
			} as never),
		).toThrow('relation-target input contains an unknown clause: skip')
		expect(() => queryFromGetInput(Post, {} as never)).toThrow(
			'get input id must be a string',
		)
		expect(() => queryFromGetInput(Post, { id: 42 } as never)).toThrow(
			'get input id must be a string',
		)
	})

	it('rejects ambiguous ordering and competing pagination strategies', () => {
		expect(() =>
			queryFromFindManyInput(Post, {
				orderBy: [{ createdAt: 'desc', id: 'asc' }],
			} as never),
		).toThrow('query.orderBy[0] must contain exactly one field')
		expect(() =>
			queryFromFindManyInput(Post, {
				cursor: 'cursor',
				offset: 10,
			} as never),
		).toThrow('query cannot combine offset and cursor pagination')
		expect(
			queryFromFindManyInput(Post, { cursor: true }).ast.pagination,
		).toEqual({
			after: undefined,
			kind: 'cursor-pagination',
		})
		expect(() =>
			queryFromFindManyInput(Post, { cursor: false } as never),
		).toThrow('query.cursor must be true or an opaque string')
	})
})

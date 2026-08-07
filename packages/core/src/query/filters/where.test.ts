import { describe, expect, it } from 'vitest'

import {
	Schema,
	booleanField,
	intField,
	jsonField,
	objectField,
	pointerField,
	relationField,
	stringField,
} from '../../schema/index.js'
import { fieldPath } from './factory.js'
import { QueryBuilder } from '../query/query.js'
import { WhereBuilder, normalizeWhereInput } from './where.js'

const Tag = Schema.define({
	className: 'RuntimeWhereTag',
	fields: {
		archived: booleanField(),
		label: stringField(),
	},
})

const Post = Schema.define({
	className: 'RuntimeWherePost',
	fields: {
		author: pointerField({ target: () => Tag }),
		metadata: jsonField(),
		profile: objectField({
			fields: {
				contact: objectField({ fields: { email: stringField() } }),
			},
		}),
		published: booleanField(),
		tags: relationField({ target: () => Tag }),
		title: stringField(),
		views: intField(),
	},
})

describe('WhereInput', () => {
	it('normalizes fields, logic, paths, and relations into the existing AST', () => {
		const query = new QueryBuilder(Post).where({
			published: { eq: false },
			views: { gte: 0, lt: 100 },
			profile: {
				at: [{ path: ['contact', 'email'], eq: 'ada@example.com' }],
			},
			OR: [{ title: { startsWith: 'Guide' } }, { views: { gt: 50 } }],
			tags: {
				count: { gte: 2, lt: 10 },
				some: { label: { eq: 'typescript' } },
			},
		})

		expect(query.ast.where?.expression).toMatchObject({
			kind: 'and',
		})
		expect(JSON.stringify(query.ast.where?.expression)).toContain(
			'ada@example.com',
		)
		expect(JSON.stringify(query.ast.where?.expression)).toContain(
			'relation-predicate',
		)
		expect(JSON.stringify(query.ast.where?.expression)).toContain(
			'relation-count',
		)
	})

	it('uses WhereBuilder only as an immutable producer of the same object contract', () => {
		const candidates = [0, 10]
		const base = new WhereBuilder(Post).eq('published', false)
		const builder = base
			.in('views', candidates)
			.gte('views', 0)
			.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com')
			.count('tags', { between: { lower: 1, upper: 3 } })
			.eq('author', 'author-id')
			.is('author', { archived: { eq: false } })
			.isNot('author', (author) => author.eq('label', 'blocked'))
		candidates.push(20)

		const built = builder.build()
		const fromBuilder = new QueryBuilder(Post).where(builder)
		const fromObject = new QueryBuilder(Post).where(built)

		expect(base.build()).toStrictEqual({ published: { eq: false } })
		expect(fromObject.ast.where).toStrictEqual(fromBuilder.ast.where)
		expect(JSON.stringify(built)).not.toContain('20')
		expect(Object.isFrozen(builder)).toBe(true)
		expect(Object.isFrozen(built)).toBe(true)
	})

	it('normalizes pointer IDs separately from target traversal predicates', () => {
		const query = new QueryBuilder(Post).where({
			author: {
				eq: 'author-id',
				in: ['author-id', 'reviewer-id'],
				is: { archived: { eq: false } },
				isNot: { label: { eq: 'blocked' } },
			},
		})
		const serialized = new WhereBuilder(Post)
			.eq('author', 'author-id')
			.is('author', { archived: { eq: false } })
			.build()
		const expression = query.ast.where?.expression

		expect(JSON.stringify(expression)).toContain('relation-predicate')
		expect(serialized).toStrictEqual({
			AND: [
				{ author: { eq: 'author-id' } },
				{ author: { is: { archived: { eq: false } } } },
			],
		})
		expect(() =>
			normalizeWhereInput(Post, {
				author: { eq: Tag.pointer('author-id') },
			} as never),
		).toThrow('must be a target object id')
		expect(() =>
			normalizeWhereInput(Post, { author: { eq: null } } as never),
		).toThrow('must be a target object id')
	})

	it('accepts the short callback builder without exposing a second vocabulary', () => {
		const callback = new QueryBuilder(Post).where((where) =>
			where
				.eq('published', false)
				.gte('views', 0)
				.matches('title', { flags: [], source: '^Ultima' }),
		)
		const direct = new QueryBuilder(Post).where({
			published: { eq: false },
			views: { gte: 0 },
			title: { matches: { flags: [], source: '^Ultima' } },
		})

		expect(callback.ast.where).toStrictEqual(direct.ast.where)
	})

	it('normalizes explicit relation emptiness to existing quantifiers', () => {
		const isEmpty = new QueryBuilder(Post).where({ tags: { isEmpty: true } })
		const none = new QueryBuilder(Post).where({ tags: { none: {} } })
		const isNotEmpty = new QueryBuilder(Post).where({
			tags: { isNotEmpty: true },
		})
		const some = new QueryBuilder(Post).where({ tags: { some: {} } })
		const emptyBuilder = new QueryBuilder(Post).where((where) =>
			where.isEmpty('tags'),
		)
		const nonEmptyBuilder = new QueryBuilder(Post).where((where) =>
			where.isNotEmpty('tags'),
		)

		expect(isEmpty.ast.where).toStrictEqual(none.ast.where)
		expect(isNotEmpty.ast.where).toStrictEqual(some.ast.where)
		expect(emptyBuilder.ast.where).toStrictEqual(none.ast.where)
		expect(nonEmptyBuilder.ast.where).toStrictEqual(some.ast.where)
	})

	it('keeps filtered cardinality comparisons in one relation node', () => {
		const query = new QueryBuilder(Post).where({
			tags: {
				count: {
					where: { archived: { eq: false } },
					gte: 2,
					lt: 10,
				},
			},
		})
		const expression = query.ast.where?.expression

		expect(expression).toMatchObject({
			comparisons: [
				{ operator: 'greater-than-or-equal', value: 2 },
				{ operator: 'less-than', value: 10 },
			],
			expression: {
				field: 'archived',
				kind: 'equal',
				value: false,
			},
			field: 'tags',
			kind: 'relation-count',
		})
		expect(
			new WhereBuilder(Post)
				.count('tags', {
					where: { archived: { eq: false } },
					gte: 2,
					lt: 10,
				})
				.build(),
		).toStrictEqual({
			tags: {
				count: {
					gte: 2,
					lt: 10,
					where: { archived: { eq: false } },
				},
			},
		})
	})

	it('rejects malformed, unsupported, and circular objects', () => {
		expect(() =>
			normalizeWhereInput(Post, {
				published: { gte: false },
			} as never),
		).toThrow('does not support boolean fields')
		expect(() =>
			normalizeWhereInput(Post, { missing: { eq: true } } as never),
		).toThrow('must reference a schema field')
		expect(() =>
			normalizeWhereInput(Post, { tags: { isNull: true } } as never),
		).toThrow('query operator null does not support relation fields')
		expect(() =>
			normalizeWhereInput(Post, { tags: { isNotNull: true } } as never),
		).toThrow('query operator null does not support relation fields')
		expect(() =>
			normalizeWhereInput(Post, { tags: { isEmpty: false } } as never),
		).toThrow('where.tags.isEmpty must be true')
		expect(() =>
			normalizeWhereInput(Post, { title: { isEmpty: true } } as never),
		).toThrow('where.title.none requires a relation field')
		expect(() =>
			normalizeWhereInput(Post, { tags: { count: { gte: -1 } } }),
		).toThrow('must be a non-negative safe integer')
		expect(() =>
			normalizeWhereInput(Post, { tags: { count: { gte: 1.5 } } }),
		).toThrow('must be a non-negative safe integer')
		expect(() => normalizeWhereInput(Post, { tags: { count: {} } })).toThrow(
			'must contain an operator',
		)
		expect(() =>
			normalizeWhereInput(Post, { tags: { count: { where: {} } } }),
		).toThrow('must contain an operator')
		expect(() =>
			normalizeWhereInput(Post, {
				tags: { count: { missing: 1 } },
			} as never),
		).toThrow('is not a supported where operator')

		const circular: Record<string, unknown> = {}
		circular.NOT = circular

		expect(() => normalizeWhereInput(Post, circular as never)).toThrow(
			'where must not contain circular references',
		)
	})
})

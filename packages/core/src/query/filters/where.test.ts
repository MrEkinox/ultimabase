import { describe, expect, it } from 'vitest'

import {
	Schema,
	booleanField,
	intField,
	jsonField,
	objectField,
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
			tags: { some: { label: { eq: 'typescript' } } },
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
	})

	it('uses WhereBuilder only as an immutable producer of the same object contract', () => {
		const candidates = [0, 10]
		const base = new WhereBuilder(Post).eq('published', false)
		const builder = base
			.in('views', candidates)
			.gte('views', 0)
			.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com')
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

		const circular: Record<string, unknown> = {}
		circular.NOT = circular

		expect(() => normalizeWhereInput(Post, circular as never)).toThrow(
			'where must not contain circular references',
		)
	})
})

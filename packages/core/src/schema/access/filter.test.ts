import { describe, expect, it } from 'vitest'

import { Schema } from '../index.js'
import { WhereBuilder } from '../../query/index.js'
import {
	combineAccessWhereResults,
	createAccessWhere,
	normalizeAccessWhereResult,
} from './filter.js'

const Author = Schema.define({
	className: 'AccessWhereAuthor',
	fields: (field) => ({ active: field.boolean(), name: field.string() }),
})
const Tag = Schema.define({
	className: 'AccessWhereTag',
	fields: (field) => ({ label: field.string(), visible: field.boolean() }),
})
const Article = Schema.define({
	className: 'AccessWhereArticle',
	fields: (field) => ({
		aliases: field.string({ list: true }),
		author: field.pointer({ target: () => Author }),
		metadata: field.object({ fields: (field) => ({ label: field.string() }) }),
		published: field.boolean(),
		score: field.int(),
		status: field.enum({ values: ['draft', 'published'] }),
		tags: field.relation({ target: () => Tag }),
		title: field.string(),
		views: field.int(),
	}),
})

describe('Access where normalization', () => {
	it('uses the public where object as the canonical policy input', () => {
		const expression = normalizeAccessWhereResult(Article, {
			metadata: {
				at: [{ path: ['label'], eq: 'typed' }],
				containedBy: { label: 'typed' },
				contains: { label: 'typed' },
				hasAllKeys: ['label'],
				hasAnyKeys: ['label'],
				hasKey: 'label',
				jsonPathExists: { source: '$.label' },
			},
			published: { eq: true },
			status: { in: ['draft', 'published'], ne: 'draft' },
			title: {
				contains: 'Base',
				endsWith: 'Base',
				matches: { flags: ['case-insensitive'], source: '^Ultima' },
				startsWith: 'Ultima',
			},
			views: {
				between: { lower: 10, upper: 100 },
				gte: 10,
				lt: 100,
				notBetween: { lower: 40, upper: 60 },
			},
		})

		expect(expression).toMatchObject({ kind: 'and' })
		expect(Object.isFrozen(expression)).toBe(true)
	})

	it('reuses the immutable WhereBuilder and its short operator names', () => {
		const base = createAccessWhere(Article)
		const expression = normalizeAccessWhereResult(
			Article,
			base
				.eq('published', true)
				.ne('status', 'draft')
				.gte('views', 10)
				.lt('views', 100)
				.in('status', ['draft', 'published'])
				.notIn('status', ['draft'])
				.or({ title: { startsWith: 'public-' } }),
		)

		expect(expression).toMatchObject({ kind: 'or' })
		expect(base.build()).toStrictEqual({})
		expect(Object.isFrozen(base)).toBe(true)
	})

	it('normalizes pointer and relation policies through the shared where contract', () => {
		const expression = normalizeAccessWhereResult(
			Article,
			new WhereBuilder(Article)
				.is('author', (author) => author.eq('active', true))
				.some('tags', (tag) => tag.eq('visible', true))
				.count('tags', {
					gte: 2,
					where: { label: { startsWith: 'core-' } },
				}),
		)

		expect(expression).toMatchObject({ kind: 'and' })
	})

	it('keeps independent policy branches monotonic through AND', () => {
		const expression = combineAccessWhereResults(Article, [
			{ published: { eq: true } },
			new WhereBuilder(Article).gt('views', 100),
		])

		expect(expression).toMatchObject({ kind: 'and' })
		expect(combineAccessWhereResults(Article, [])).toStrictEqual({
			kind: 'constant',
			value: true,
		})
		expect(() => normalizeAccessWhereResult(Article, false)).toThrow(
			new TypeError(
				'Access where must return undefined, a WhereInput, or a WhereBuilder',
			),
		)
	})

	it('rejects forged, callback, and cross-schema results', () => {
		const Comment = Schema.define({
			className: 'AccessWhereComment',
			fields: (field) => ({ body: field.string() }),
		})

		expect(() => normalizeAccessWhereResult(Article, undefined)).toThrow(
			new TypeError(
				'Access where must return undefined, a WhereInput, or a WhereBuilder',
			),
		)
		expect(() => normalizeAccessWhereResult(Article, () => true)).toThrow(
			new TypeError(
				'Access where must return undefined, a WhereInput, or a WhereBuilder',
			),
		)
		expect(() =>
			normalizeAccessWhereResult(
				Article,
				new WhereBuilder(Comment).eq('body', 'Comment'),
			),
		).toThrow(new TypeError('WhereBuilder must use the same schema definition'))
	})
})

import { describe, expect, it } from 'vitest'

import { normalizeGraphqlRule } from './rules.js'

describe('GraphQL schema rules', () => {
	it('snapshots sparse rules without mutating caller values', () => {
		const value = { count: true, findOne: false, typeName: 'Article' }
		const rule = normalizeGraphqlRule(value, 'Post.graphql')

		value.count = false

		expect(rule).toStrictEqual({
			count: true,
			findOne: false,
			typeName: 'Article',
		})
		expect(Object.isFrozen(rule)).toBe(true)
	})

	// ADR-0347 decision 2: the graphql key takes every level of the vocabulary.
	it('keeps every key of the exposure vocabulary and plugin command names', () => {
		expect(
			normalizeGraphqlRule(
				{ all: false, read: true, archive: true, softDeleteOne: true },
				'Post.graphql',
			),
		).toStrictEqual({
			all: false,
			archive: true,
			read: true,
			softDeleteOne: true,
		})
		expect(normalizeGraphqlRule(false, 'Post.graphql')).toBe(false)
		expect(
			normalizeGraphqlRule({ typeName: 'Task' }, 'Post.graphql'),
		).toStrictEqual({ typeName: 'Task' })
	})

	it.each([
		[null, 'must be a boolean or plain object'],
		[{ 'find-many': true }, 'unknown method: find-many'],
		[{ operations: { count: true } }, 'must be a boolean'],
		[{ count: 'yes' }, 'must be a boolean'],
		[{ typeName: '' }, 'non-empty string'],
		[
			{ typeName: 'Task', count: 'yes' },
			'Post.graphql.count must be a boolean',
		],
		[{ Extra: true }, 'unknown method'],
		[JSON.parse('{"__proto__":true}'), 'unknown method: __proto__'],
	])('rejects malformed rule %#', (value, message) => {
		expect(() => normalizeGraphqlRule(value, 'Post.graphql')).toThrow(message)
	})
})

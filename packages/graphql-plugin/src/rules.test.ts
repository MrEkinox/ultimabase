import { describe, expect, it } from 'vitest'

import { isGraphqlMethodEnabled, normalizeGraphqlRule } from './rules.js'

describe('GraphQL schema rules', () => {
	it('snapshots sparse rules without mutating caller values', () => {
		const value = { count: true, findOne: false, typeName: 'Article' }
		const rule = normalizeGraphqlRule(value, 'Post.graphql', true)

		value.count = false

		expect(rule).toStrictEqual({
			methods: { count: true, findOne: false },
			typeName: 'Article',
		})
		expect(Object.isFrozen(rule)).toBe(true)
		if (typeof rule === 'object')
			expect(Object.isFrozen(rule.methods)).toBe(true)
	})

	it('resolves schema, plugin, and built-in defaults in exact order', () => {
		const schema = normalizeGraphqlRule(
			{ findOne: false, softDeleteOne: true },
			'Post.graphql',
			true,
		)
		const plugin = normalizeGraphqlRule(
			{ count: true, findOne: true, updateMany: true },
			'GraphQL plugin default',
			false,
		)

		expect(isGraphqlMethodEnabled(schema, plugin, 'findOne')).toBe(false)
		expect(isGraphqlMethodEnabled(schema, plugin, 'count')).toBe(true)
		expect(isGraphqlMethodEnabled(schema, plugin, 'createOne')).toBe(true)
		expect(isGraphqlMethodEnabled(schema, plugin, 'upsertOne')).toBe(false)
		expect(isGraphqlMethodEnabled(schema, plugin, 'updateMany')).toBe(true)
		expect(isGraphqlMethodEnabled(schema, plugin, 'deleteMany')).toBe(false)
		// A plugin command is exposed only when named or when a rule is `true`.
		expect(isGraphqlMethodEnabled(schema, plugin, 'softDeleteOne')).toBe(true)
		expect(isGraphqlMethodEnabled(schema, plugin, 'restoreOne')).toBe(false)
		expect(isGraphqlMethodEnabled(true, undefined, 'restoreOne')).toBe(true)
		expect(isGraphqlMethodEnabled(undefined, true, 'restoreOne')).toBe(true)
		expect(isGraphqlMethodEnabled(undefined, undefined, 'restoreOne')).toBe(
			false,
		)
		expect(isGraphqlMethodEnabled(false, true, 'findMany')).toBe(false)
	})

	it.each([
		[null, true, 'must be a boolean or plain object'],
		[{ get: true }, false, 'unknown method: get'],
		[{ operations: { count: true } }, true, 'must be a boolean'],
		[{ count: 'yes' }, true, 'must be a boolean'],
		[{ typeName: '' }, true, 'non-empty string'],
		[{ Extra: true }, true, 'unknown method'],
		[{ softDeleteOne: true }, false, 'unknown method'],
		[{ typeName: 'Task' }, false, 'unknown method'],
	])('rejects malformed rule %#', (value, schema, message) => {
		expect(() => normalizeGraphqlRule(value, 'Post.graphql', schema)).toThrow(
			message,
		)
	})
})

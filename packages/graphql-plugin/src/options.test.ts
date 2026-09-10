import { describe, expect, it } from 'vitest'

import {
	normalizeGraphqlSchemaExposure,
	normalizeGraphqlSchemaOperations,
} from './options.js'
import {
	resolveGraphqlBulkOperation,
	resolveGraphqlSchemaOperation,
	resolveGraphqlSchemaMutations,
} from './surfaces.js'

describe('GraphQL schema exposure options', () => {
	it('snapshots sparse nested options without mutating caller values', () => {
		const bulk = { create: true }
		const operations = { bulk, get: false }
		const exposure = normalizeGraphqlSchemaExposure(
			{ operations, typeName: 'Article' },
			'Post.graphql',
		)

		bulk.create = false
		operations.get = true

		expect(exposure).toStrictEqual({
			operations: { bulk: { create: true }, get: false },
			typeName: 'Article',
		})
		expect(Object.isFrozen(exposure)).toBe(true)
		if (typeof exposure === 'object') {
			expect(Object.isFrozen(exposure.operations)).toBe(true)
		}
	})

	it('resolves schema, plugin, and built-in defaults in exact order', () => {
		const direct = normalizeGraphqlSchemaExposure(
			{ operations: { get: false } },
			'Post.graphql',
		)
		const pluginDefault = normalizeGraphqlSchemaOperations(
			{ count: true, get: true, mutations: false, bulk: { update: true } },
			'GraphQL plugin default',
		)

		expect(resolveGraphqlSchemaOperation(direct, pluginDefault, 'get')).toBe(
			false,
		)
		expect(resolveGraphqlSchemaOperation(direct, pluginDefault, 'count')).toBe(
			true,
		)
		expect(resolveGraphqlSchemaOperation(direct, pluginDefault, 'create')).toBe(
			true,
		)
		expect(resolveGraphqlSchemaOperation(direct, pluginDefault, 'upsert')).toBe(
			false,
		)
		expect(resolveGraphqlBulkOperation(direct, pluginDefault, 'update')).toBe(
			true,
		)
		expect(resolveGraphqlBulkOperation(direct, pluginDefault, 'delete')).toBe(
			false,
		)
		expect(resolveGraphqlSchemaMutations(direct, pluginDefault)).toBe(false)
		expect(resolveGraphqlSchemaMutations(true, pluginDefault)).toBe(true)
		expect(resolveGraphqlSchemaMutations(undefined, undefined)).toBe(true)
	})

	it.each([
		[{ operations: { unknown: true } }, 'unknown option'],
		[{ operations: { get: 'yes' } }, 'must be a boolean'],
		[{ operations: { bulk: { unknown: true } } }, 'unknown option'],
		[{ typeName: '' }, 'non-empty string'],
		[{ extra: true }, 'unknown option'],
	])('rejects malformed exposure %#', (value, message) => {
		expect(() => normalizeGraphqlSchemaExposure(value, 'Post.graphql')).toThrow(
			message,
		)
	})
})

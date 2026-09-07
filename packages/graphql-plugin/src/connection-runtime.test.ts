import { Buffer } from 'node:buffer'

import { Schema, createApplication } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { readGraphqlConnectionRuntime } from './application.js'
import { GraphqlInvalidCursorError } from './connection-errors.js'
import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
} from './connection-limits.js'
import { GraphqlConnectionRuntime } from './connection-runtime.js'
import { graphqlPlugin } from './plugin.js'
import type { GraphqlSchemaExposureOption } from './options.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const ConnectionRecord = Schema.define({
	className: 'GraphqlConnectionRecord',
	fields: (field) => ({ group: field.string(), rank: field.int() }),
	graphql: true,
})

const key = (fill: number): Uint8Array => new Uint8Array(32).fill(fill)

const prepareRuntime = async () => {
	const application = await createApplication({
		pluginPrivileges: { logger: false },
		plugins: [graphqlPlugin()],
		schemas: [ConnectionRecord],
	})
	return {
		application,
		runtime: new GraphqlConnectionRuntime(
			defaultGraphqlExecutionLimits,
			key(1),
		),
	}
}

const scope = {
	relationPath: [] as const,
	typeName: 'GraphqlConnectionRecord',
}

describe('GraphQL connection runtime', () => {
	it('builds stable multi-page windows and opaque edge cursors', async () => {
		const { application, runtime } = await prepareRuntime()
		const first = runtime.prepare({
			arguments: {
				first: 2,
				orderBy: [{ direction: 'desc', field: 'rank' }],
				where: { group: { eq: 'a' } },
			},
			schema: ConnectionRecord,
			...scope,
		})

		expect(first.clauses).toStrictEqual({
			limit: 3,
			orderBy: { rank: 'desc', id: 'asc' },
			where: { group: { eq: 'a' } },
		})
		const page = runtime.page(first.page, [
			{ id: 'a', rank: 3 },
			{ id: 'b', rank: 3 },
			{ id: 'c', rank: 2 },
		])
		expect(page.nodes.map(({ id }) => id)).toStrictEqual(['a', 'b'])
		expect(page.edges.map(({ node }) => node.id)).toStrictEqual(['a', 'b'])
		expect(page.edges[0]?.cursor).not.toBe(page.edges[1]?.cursor)
		const payloadSegment = page.edges[0]?.cursor.split('.')[0]
		if (payloadSegment === undefined) {
			throw new TypeError('Expected an encoded cursor payload')
		}
		const payload: unknown = JSON.parse(
			Buffer.from(payloadSegment, 'base64url').toString('utf8'),
		)
		if (!isPlainRecord(payload)) {
			throw new TypeError('Expected a cursor payload object')
		}
		expect(Object.keys(payload).sort()).toStrictEqual([
			'fingerprint',
			'offset',
			'path',
			'type',
			'v',
		])
		expect(page.pageInfo).toMatchObject({
			endCursor: page.edges[1]?.cursor,
			hasNextPage: true,
			hasPreviousPage: false,
			startCursor: page.edges[0]?.cursor,
		})

		const second = runtime.prepare({
			arguments: {
				after: page.pageInfo.endCursor,
				first: 2,
				orderBy: [{ direction: 'desc', field: 'rank' }],
				where: { group: { eq: 'a' } },
			},
			schema: ConnectionRecord,
			...scope,
		})
		expect(second.clauses).toMatchObject({ limit: 3, offset: 2 })
		const last = runtime.page(second.page, [{ id: 'c' }, { id: 'd' }])
		expect(last.nodes.map(({ id }) => id)).toStrictEqual(['c', 'd'])
		expect(last.pageInfo).toMatchObject({
			hasNextPage: false,
			hasPreviousPage: true,
		})

		runtime.dispose()
		await application.dispose()
	})

	it('canonicalizes GraphQL wire filter object keys for cursor binding', async () => {
		const { application, runtime } = await prepareRuntime()
		const prepared = runtime.prepare({
			arguments: {
				first: 1,
				where: { group: { eq: 'a' }, rank: { gte: 1 } },
			},
			schema: ConnectionRecord,
			...scope,
		})
		const cursor = runtime.page(prepared.page, [{ id: 'a' }]).pageInfo.endCursor
		const reordered = runtime.prepare({
			arguments: {
				after: cursor,
				first: 1,
				where: { rank: { gte: 1 }, group: { eq: 'a' } },
			},
			schema: ConnectionRecord,
			...scope,
		})
		expect(reordered.clauses).toMatchObject({ offset: 1 })

		runtime.dispose()
		await application.dispose()
	})

	it('handles empty, exact-boundary, default, and zero-sized pages', async () => {
		const { application, runtime } = await prepareRuntime()
		const defaults = runtime.prepare({
			arguments: {},
			schema: ConnectionRecord,
			...scope,
		})
		expect(defaults.clauses).toStrictEqual({
			limit: 26,
			orderBy: { id: 'asc' },
		})
		expect(
			runtime.prepare({
				arguments: { after: null, first: null, orderBy: null, where: null },
				schema: ConnectionRecord,
				...scope,
			}).clauses,
		).toStrictEqual(defaults.clauses)
		expect(runtime.page(defaults.page, []).pageInfo).toStrictEqual({
			endCursor: null,
			hasNextPage: false,
			hasPreviousPage: false,
			startCursor: null,
		})

		const exact = runtime.prepare({
			arguments: { first: 2 },
			schema: ConnectionRecord,
			...scope,
		})
		expect(
			runtime.page(exact.page, [{ id: 'a' }, { id: 'b' }]).pageInfo,
		).toMatchObject({ hasNextPage: false })

		const zero = runtime.prepare({
			arguments: { first: 0 },
			schema: ConnectionRecord,
			...scope,
		})
		expect(zero.clauses).toMatchObject({ limit: 1 })
		expect(runtime.page(zero.page, [{ id: 'a' }])).toStrictEqual({
			edges: [],
			nodes: [],
			pageInfo: {
				endCursor: null,
				hasNextPage: true,
				hasPreviousPage: false,
				startCursor: null,
			},
		})

		runtime.dispose()
		await application.dispose()
	})

	it('retains explicit offset behavior when rows are inserted or deleted', async () => {
		const { application, runtime } = await prepareRuntime()
		const first = runtime.prepare({
			arguments: { first: 2 },
			schema: ConnectionRecord,
			...scope,
		})
		const cursor = runtime.page(first.page, ['a', 'b']).pageInfo.endCursor
		const next = runtime.prepare({
			arguments: { after: cursor, first: 2 },
			schema: ConnectionRecord,
			...scope,
		})
		expect(next.clauses.offset).toBe(2)

		// Offset pages deliberately observe the current ordered rows, not a snapshot.
		expect(['x', 'a', 'b', 'c'].slice(2, 4)).toStrictEqual(['b', 'c'])
		expect(['b', 'c', 'd'].slice(2, 4)).toStrictEqual(['d'])

		runtime.dispose()
		await application.dispose()
	})

	it('rejects malformed, altered, foreign, or context-shifted cursors uniformly', async () => {
		const { application, runtime } = await prepareRuntime()
		const prepared = runtime.prepare({
			arguments: { first: 1 },
			schema: ConnectionRecord,
			...scope,
		})
		const cursor = runtime.page(prepared.page, [{ id: 'a' }]).pageInfo.endCursor
		if (cursor === null) throw new TypeError('Expected a cursor')
		const foreign = new GraphqlConnectionRuntime(
			defaultGraphqlExecutionLimits,
			key(2),
		)
		const altered = `${cursor.slice(0, -1)}${cursor.endsWith('a') ? 'b' : 'a'}`
		const invalidInputs: readonly unknown[] = [
			'',
			'.',
			'not-a-cursor',
			altered,
			'a'.repeat(4097),
			...Array.from({ length: 32 }, (_, index) => `malformed-${String(index)}`),
		]
		for (const after of invalidInputs) {
			expect(() =>
				runtime.prepare({
					arguments: { after, first: 1 },
					schema: ConnectionRecord,
					...scope,
				}),
			).toThrow(GraphqlInvalidCursorError)
		}
		for (const options of [
			{ arguments: { after: cursor, first: 1, where: { rank: { eq: 1 } } } },
			{
				arguments: {
					after: cursor,
					first: 1,
					orderBy: [{ direction: 'asc', field: 'rank' }],
				},
			},
			{ arguments: { after: cursor, first: 1 }, typeName: 'OtherType' },
			{ arguments: { after: cursor, first: 1 }, relationPath: ['children'] },
		] as const) {
			expect(() =>
				runtime.prepare({
					schema: ConnectionRecord,
					...scope,
					...options,
				}),
			).toThrow(GraphqlInvalidCursorError)
		}
		expect(() =>
			foreign.prepare({
				arguments: { after: cursor, first: 1 },
				schema: ConnectionRecord,
				...scope,
			}),
		).toThrow(GraphqlInvalidCursorError)

		foreign.dispose()
		runtime.dispose()
		await application.dispose()
	})

	it('reuses a relation cursor for the same path without binding a parent ID', async () => {
		const { application, runtime } = await prepareRuntime()
		const relationScope = {
			relationPath: ['posts', 'comments'],
			typeName: 'GraphqlConnectionRecord',
		} as const
		const prepared = runtime.prepare({
			arguments: { first: 1 },
			schema: ConnectionRecord,
			...relationScope,
		})
		const cursor = runtime.page(prepared.page, [{ id: 'a' }]).pageInfo.endCursor
		const nextParent = runtime.prepare({
			arguments: { after: cursor, first: 1 },
			schema: ConnectionRecord,
			...relationScope,
		})
		expect(nextParent.clauses).toMatchObject({ offset: 1 })

		runtime.dispose()
		await application.dispose()
	})

	it('invalidates cursors and page plans at the application lifetime boundary', async () => {
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				graphqlPlugin({
					limits: { defaultPageSize: 3, maxPageSize: 5 },
				}),
			],
			schemas: [ConnectionRecord],
		})
		const graphqlApplication = application.getPlugin(
			'@ultimabase/graphql-plugin',
		)
		const runtime = readGraphqlConnectionRuntime(graphqlApplication)
		const prepared = runtime.prepare({
			arguments: {},
			schema: ConnectionRecord,
			...scope,
		})
		expect(prepared.clauses).toMatchObject({ limit: 4 })
		await application.dispose()

		expect(() => runtime.page(prepared.page, [])).toThrow('disposed')
		expect(() => readGraphqlConnectionRuntime(graphqlApplication)).toThrow(
			'disposed',
		)
	})

	it('enforces configured page limits before Core execution', async () => {
		const { application } = await prepareRuntime()
		const runtime = new GraphqlConnectionRuntime(
			normalizeGraphqlExecutionLimits({
				defaultPageSize: 2,
				maxPageSize: 3,
			}),
			key(3),
		)
		expect(() =>
			runtime.prepare({
				arguments: { first: 4 },
				schema: ConnectionRecord,
				...scope,
			}),
		).toThrow('0 to 3')

		runtime.dispose()
		await application.dispose()
	})
})

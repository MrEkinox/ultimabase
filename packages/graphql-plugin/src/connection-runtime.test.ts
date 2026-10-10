import { Buffer } from 'node:buffer'

import { FrameworkError, UltimaBase } from '@ultimabase/core'
import { encodeQueryCursor } from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { readGraphqlConnectionRuntime } from './application.js'
import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
} from './connection-limits.js'
import { GraphqlConnectionRuntime } from './connection-runtime.js'
import { graphqlPlugin } from './plugin.js'
import { initializeGraphqlTestApplication as createApplication } from './application.test-support.js'
const GraphqlSchemaApplication = UltimaBase.use(graphqlPlugin())

const ConnectionRecord = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlConnectionRecord',
	fields: (field) => ({ group: field.string(), rank: field.int() }),
	graphql: true,
})

const ids = ['a', 'b', 'c', 'd'].map(
	(suffix) => `0198f090-2a50-7000-8000-00000000000${suffix}`,
)
const [a = '', b = '', c = '', d = ''] = ids

const prepareRuntime = async () => {
	const application = await createApplication({
		logger: false,
		plugins: [graphqlPlugin()],
		schemas: [ConnectionRecord],
	})
	return {
		application,
		runtime: new GraphqlConnectionRuntime(defaultGraphqlExecutionLimits),
	}
}

const scope = {
	relationPath: [] as const,
	typeName: 'GraphqlConnectionRecord',
}

const invalidPosition = (run: () => unknown): unknown => {
	try {
		run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError) return error
		throw error
	}
	throw new Error('expected a position error')
}

// ADR-0309: Relay `first`/`after` map to Core `take`/`after`.
describe('GraphQL connection runtime', () => {
	it('builds pages from positions and opaque unsigned edge cursors', async () => {
		const { application, runtime } = await prepareRuntime()
		const orderBy = [{ direction: 'desc', field: 'rank' }] as const
		const first = runtime.prepare({
			arguments: { first: 2, orderBy, where: { group: { eq: 'a' } } },
			schema: ConnectionRecord,
			...scope,
		})

		expect(first.clauses).toStrictEqual({
			orderBy: { rank: 'desc', id: 'asc' },
			take: 3,
			where: { group: { eq: 'a' } },
		})
		expect(first.orderedFields).toStrictEqual(['rank', 'id'])
		const page = runtime.page(first.page, [
			{ id: a, rank: 3 },
			{ id: b, rank: 3 },
			{ id: c, rank: 2 },
		])
		expect(page.nodes.map(({ id }) => id)).toStrictEqual([a, b])
		expect(page.edges.map(({ cursor }) => cursor)).toStrictEqual([
			encodeQueryCursor(ConnectionRecord, { rank: 'desc' }, { id: a, rank: 3 }),
			encodeQueryCursor(ConnectionRecord, { rank: 'desc' }, { id: b, rank: 3 }),
		])
		expect(
			JSON.parse(
				Buffer.from(page.edges[0]?.cursor ?? '', 'base64url').toString(),
			),
		).toStrictEqual({
			o: [
				['rank', 'd'],
				['id', 'a'],
			],
			p: [3, a],
			s: 'GraphqlConnectionRecord',
			v: 1,
		})
		expect(page.pageInfo).toMatchObject({
			endCursor: page.edges[1]?.cursor,
			hasNextPage: true,
			hasPreviousPage: false,
			startCursor: page.edges[0]?.cursor,
		})

		const second = runtime.prepare({
			arguments: { after: page.pageInfo.endCursor, first: 2, orderBy },
			schema: ConnectionRecord,
			...scope,
		})
		expect(second.clauses).toMatchObject({
			after: { id: b, rank: 3 },
			take: 3,
		})
		const last = runtime.page(second.page, [
			{ id: c, rank: 2 },
			{ id: d, rank: 1 },
		])
		expect(last.nodes.map(({ id }) => id)).toStrictEqual([c, d])
		expect(last.pageInfo).toMatchObject({
			hasNextPage: false,
			hasPreviousPage: true,
		})

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
			orderBy: { id: 'asc' },
			take: 101,
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
			runtime.page(exact.page, [{ id: a }, { id: b }]).pageInfo,
		).toMatchObject({ hasNextPage: false })

		const zero = runtime.prepare({
			arguments: { first: 0 },
			schema: ConnectionRecord,
			...scope,
		})
		expect(zero.clauses).toMatchObject({ take: 1 })
		expect(runtime.page(zero.page, [{ id: a }])).toStrictEqual({
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

	it('rejects malformed or mismatched cursors with the after VALIDATION_ERROR', async () => {
		const { application, runtime } = await prepareRuntime()
		const prepared = runtime.prepare({
			arguments: { first: 1 },
			schema: ConnectionRecord,
			...scope,
		})
		const cursor = runtime.page(prepared.page, [{ id: a }]).pageInfo.endCursor
		if (cursor === null) throw new TypeError('Expected a cursor')
		const invalid = {
			code: 'VALIDATION_ERROR',
			publicDetails: { parameter: 'after' },
		}
		for (const after of ['', '.', 'not a cursor', 'a'.repeat(4097), 7]) {
			expect(
				invalidPosition(() =>
					runtime.prepare({
						arguments: { after, first: 1 },
						schema: ConnectionRecord,
						...scope,
					}),
				),
			).toMatchObject(invalid)
		}
		// A cursor of another ordering does not position this one.
		expect(
			invalidPosition(() =>
				runtime.prepare({
					arguments: {
						after: cursor,
						first: 1,
						orderBy: [{ direction: 'asc', field: 'rank' }],
					},
					schema: ConnectionRecord,
					...scope,
				}),
			),
		).toMatchObject(invalid)
		// Positions are unsigned: another runtime, or a restart, accepts them.
		expect(
			new GraphqlConnectionRuntime().prepare({
				arguments: { after: cursor, first: 1 },
				schema: ConnectionRecord,
				...scope,
			}).clauses,
		).toMatchObject({ after: { id: a } })

		runtime.dispose()
		await application.dispose()
	})

	// ADR-0309 step 3b amendment: nested connections page by position too.
	it('maps after on a nested relation connection to the include position', async () => {
		const { application, runtime } = await prepareRuntime()
		const relationScope = {
			relationPath: ['posts', 'comments'],
			typeName: 'GraphqlConnectionRecord',
		} as const
		const first = runtime.prepare({
			arguments: { first: 1 },
			schema: ConnectionRecord,
			...relationScope,
		})
		expect(first.clauses).toStrictEqual({ orderBy: { id: 'asc' }, take: 2 })
		const page = runtime.page(first.page, [{ id: a }, { id: b }])
		expect(page.pageInfo).toMatchObject({ hasNextPage: true })
		expect(
			runtime.prepare({
				arguments: { after: page.pageInfo.endCursor, first: 1 },
				schema: ConnectionRecord,
				...relationScope,
			}).clauses,
		).toStrictEqual({ after: { id: a }, orderBy: { id: 'asc' }, take: 2 })

		runtime.dispose()
		await application.dispose()
	})

	it('invalidates page plans at the application lifetime boundary', async () => {
		const application = await createApplication({
			logger: false,
			plugins: [
				graphqlPlugin({
					pagination: { defaultTake: 3, maxTake: 5 },
				}),
			],
			schemas: [ConnectionRecord],
		})
		const graphqlApplication = application.plugin('@ultimabase/graphql-plugin')
		const runtime = readGraphqlConnectionRuntime(graphqlApplication)
		const prepared = runtime.prepare({
			arguments: {},
			schema: ConnectionRecord,
			...scope,
		})
		expect(prepared.clauses).toMatchObject({ take: 4 })
		await application.dispose()

		expect(() => runtime.page(prepared.page, [])).toThrow('disposed')
		expect(() => readGraphqlConnectionRuntime(graphqlApplication)).toThrow(
			'disposed',
		)
	})

	it('enforces configured page limits before Core execution', async () => {
		const { application } = await prepareRuntime()
		const runtime = new GraphqlConnectionRuntime(
			normalizeGraphqlExecutionLimits(undefined, {
				defaultTake: 2,
				maxTake: 3,
			}),
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

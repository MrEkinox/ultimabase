// A big live window in parts (D-272): each on its own turn of the loop, and the
// client gets what one execution would have given it.
import { httpPlugin } from '@ultimabase/http'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { ExecutionResult } from 'graphql'
import { GraphQLError } from 'graphql'
import type { FormattedExecutionResult } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { z } from 'zod'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import { graphql, graphqlPlugin } from './index.ts'
import { LiveEvent } from './live-stream.ts'
import { cut, joined, ranInPieces, rowsAtOnce } from './pieces.ts'

const Item = defineModel({
	name: 'Item',
	use: [graphql(), realtime()],
	fields: (f) => ({ rank: f.number({ integer: true }) }),
}).with({ access: allow.readOnly })

const total = rowsAtOnce * 2 + 1
let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

/** A served application holding `total` items; a client's first results. */
async function served(pagination: 'connection' | 'list') {
	let listening = ''
	const logger: Logger = {
		info: (first: string | object) => {
			if (typeof first === 'string' && first.startsWith('Listening on')) {
				listening = first.replace(/^Listening on (.*)\.$/, '$1')
			}
		},
		warn: () => undefined,
		error: () => undefined,
		child: () => logger,
	}
	const app = defineApp({
		database: memory(),
		models: [Item],
		plugins: [
			httpPlugin({ port: 0 }),
			realtimePlugin(),
			graphqlPlugin({ pagination }),
		],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	await Item.createMany(
		{ data: Array.from({ length: total }, (_, rank) => ({ rank })) },
		{ as: master },
	)
	const client = createClient({
		url: `${listening.replace(/^http/, 'ws')}/graphql`,
		webSocketImpl: WebSocket,
		retryAttempts: 0,
	})
	const firstOf = async (query: string): Promise<Result> => {
		const results = client.iterate({ query })
		const first: IteratorResult<Result, unknown> = await results.next()
		await results.return?.(undefined)
		return first.done === true ? {} : first.value
	}
	return {
		firstOf,
		closing: async () => client.dispose(),
	}
}

type Result = FormattedExecutionResult<Record<string, unknown>, unknown>

const windowOf = z.object({
	totalCount: z.number(),
	pageInfo: z.record(z.string(), z.unknown()),
	edges: z.array(
		z.object({ cursor: z.string(), node: z.object({ rank: z.number() }) }),
	),
})

const part = (value: number): ExecutionResult => ({ data: { list: [value] } })

const asked = `first: ${total}, orderBy: [{ rank: asc }]`

describe('a big live window', () => {
	it('reaches the client whole, its cursors and page info the window’s', async () => {
		const { firstOf, closing } = await served('connection')
		const whole = await firstOf(`subscription {
			items(${asked}) {
				totalCount
				pageInfo { hasNextPage startCursor endCursor }
				edges { cursor node { rank } }
			}
		}`)
		const small = await firstOf(`subscription {
			items(first: ${rowsAtOnce}, orderBy: [{ rank: asc }]) { edges { cursor } }
		}`)
		const { edges, pageInfo, totalCount } = windowOf.parse(
			whole.data?.['items'],
		)
		expect(edges.map(({ node }) => node.rank)).toEqual(
			Array.from({ length: total }, (_, rank) => rank),
		)
		expect(new Set(edges.map(({ cursor }) => cursor)).size).toBe(total)
		expect(totalCount).toBe(total)
		expect(pageInfo).toEqual({
			hasNextPage: false,
			startCursor: edges[0]?.cursor,
			endCursor: edges.at(-1)?.cursor,
		})
		const first = z
			.object({ edges: z.array(z.object({ cursor: z.string() })) })
			.parse(small.data?.['items'])
		expect(edges.slice(0, rowsAtOnce).map(({ cursor }) => cursor)).toEqual(
			first.edges.map(({ cursor }) => cursor),
		)
		expect(whole.extensions).toMatchObject({ live: { revision: 1 } })
		await closing()
	})

	it('is the rows themselves under list pagination', async () => {
		const { firstOf, closing } = await served('list')
		const whole = await firstOf(
			`subscription { items(take: ${total}, orderBy: [{ rank: asc }]) { rank } }`,
		)
		expect(whole.data?.['items']).toEqual(
			Array.from({ length: total }, (_, rank) => ({ rank })),
		)
		await closing()
	})

	it('runs once where no edge is selected', async () => {
		const { firstOf, closing } = await served('connection')
		const whole = await firstOf(
			`subscription { items(${asked}) { totalCount } }`,
		)
		expect(whole.data?.['items']).toEqual({ totalCount: total })
		await closing()
	})
})

describe('its parts', () => {
	it('are cut every rowsAtOnce, in order', () => {
		const items = Array.from({ length: total }, (_, at) => at)
		const parts = cut(items)
		expect(parts.map(({ length }) => length)).toEqual([
			rowsAtOnce,
			rowsAtOnce,
			1,
		])
		expect(parts.flat()).toEqual(items)
	})

	it('leave a turn of the loop between them', async () => {
		const turns: string[] = []
		const result = await ranInPieces(
			{
				roots: [1, 2],
				merged: (results) => joined(results, ({ data }) => data, 'list'),
			},
			(root) => {
				turns.push(`run ${String(root)}`)
				setImmediate(() => turns.push(`turn ${String(root)}`))
				return part(Number(root))
			},
			() => part(0),
		)
		expect(turns.slice(0, 3)).toEqual(['run 1', 'turn 1', 'run 2'])
		expect(result.data).toEqual({ list: [1, 2] })
	})

	it('run again whole on an error, whose path counts from its part', async () => {
		const errors = [new GraphQLError('Broken.')]
		const whole = vi.fn<() => ExecutionResult>(() => ({ data: null, errors }))
		const result = await ranInPieces(
			{ roots: [1, 2], merged: () => part(0) },
			(root) => (root === 1 ? part(1) : { data: null, errors }),
			whole,
		)
		expect(whole).toHaveBeenCalledOnce()
		expect(result).toEqual({ data: null, errors })
	})

	it('are let go of with the event (D-253)', () => {
		const event = new LiveEvent([], (result) => result, false, {
			roots: [[]],
			merged: () => ({}),
		})
		event.finish({})
		expect(event.pieces).toBeUndefined()
	})
})

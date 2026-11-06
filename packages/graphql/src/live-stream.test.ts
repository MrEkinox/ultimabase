// A live read's stream (D-154): changes a full socket cannot take are dropped
// until its window is sent again, and its end closes the read, or the socket
// when the viewer ended. A completed list is kept for a resume.
import type { ExecutionResult } from 'graphql'
import { getOperationAST, parse } from 'graphql'
import type { LiveHandle, LiveMessage, Viewer } from '@ultimabase/realtime'
import { realtimePlugin } from '@ultimabase/realtime'
import type { RealtimeApi, Realtime } from '@ultimabase/realtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import type { Channel, Keep } from './live-stream.ts'
import {
	LiveEvent,
	liveStream,
	released,
	resumed,
	SharedResults,
	variablesBelowRoot,
} from './live-stream.ts'

interface Keeping extends PluginTypes {
	readonly name: 'keeping'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
const keeping = definePlugin<Keeping>({
	name: 'keeping',
	manifest: {
		name: 'keeping',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

/** A viewer of a running application. */
async function viewer(): Promise<Viewer> {
	const app = defineApp({
		database: memory(),
		plugins: [realtimePlugin(), keeping.plugin()],
		models: [],
	})
	await app.start()
	stop = async () => app.stop()
	if (api === undefined) throw new Error('No realtime API.')
	return api.connect(new Request('http://localhost/'))
}

type Fake = {
	readonly channel: Channel
	/** Whether the socket's buffer is full. */
	full: boolean
	readonly drains: (() => void)[]
	forbidden: number
}

function fake(seen: Viewer): Fake {
	const state: Fake = {
		full: false,
		drains: [],
		forbidden: 0,
		channel: {
			viewer: seen,
			full: () => state.full,
			drained: (then) => {
				state.drains.push(then)
			},
			forbid: () => {
				state.forbidden += 1
			},
			kept: new Map(),
		},
	}
	return state
}

type Opened = {
	readonly send: (message: LiveMessage) => void
	readonly resent: () => number
	readonly closed: () => number
	readonly grown: readonly number[]
}

/** A read's handle, counting what the stream asks of it. */
function handled(): {
	readonly open: (send: (message: LiveMessage) => void) => Promise<LiveHandle>
	readonly opened: () => Opened
} {
	let send: ((message: LiveMessage) => void) | undefined
	let resent = 0
	let closed = 0
	const grown: number[] = []
	const handle: LiveHandle = {
		grow: async (more) => {
			if (more > 10) throw new Error('Too many rows.')
			grown.push(more)
		},
		resend: async () => {
			resent += 1
		},
		close: () => {
			closed += 1
		},
	}
	return {
		open: async (given) => {
			send = given
			return handle
		},
		opened: () => {
			if (send === undefined) throw new Error('Not opened.')
			const sent = send
			return {
				send: sent,
				resent: () => resent,
				closed: () => closed,
				grown,
			}
		},
	}
}

const reset = (revision: number): LiveMessage => ({
	kind: 'reset',
	revision,
	rows: [],
	hasMore: false,
})
const changed = (revision: number): LiveMessage => ({
	kind: 'changes',
	revision,
	changes: [],
})

const valued = (revision: number): LiveMessage => ({
	kind: 'value',
	revision,
	value: revision,
})

const eventOf = (message: LiveMessage) =>
	new LiveEvent(message, (result) => result)
const closedEvent = () => new LiveEvent('closed', (result) => result)

const rootsOf = async (stream: AsyncIterableIterator<LiveEvent>) => {
	const roots: unknown[] = []
	for await (const { root } of stream) roots.push(root)
	return roots
}

describe('a live stream', () => {
	it('drops changes while the socket is full, until the window comes again', async () => {
		const channel = fake(await viewer())
		const read = handled()
		const stream = await liveStream(
			channel.channel,
			read.open,
			eventOf,
			closedEvent,
		)
		const { send, resent } = read.opened()
		send(reset(1))
		channel.full = true
		send(changed(2))
		send(changed(3))
		expect(channel.drains).toHaveLength(1)
		channel.full = false
		for (const then of channel.drains) then()
		expect(resent()).toBe(1)
		send(reset(4))
		send(changed(5))
		send({ kind: 'closed' })
		send(changed(6))
		// What was queued is dropped too: the window it changed comes again.
		expect(await rootsOf(stream)).toEqual([reset(4), changed(5), 'closed'])
	})

	it("sends a big window's changes through a full socket, no window again", async () => {
		const channel = fake(await viewer())
		const read = handled()
		const stream = await liveStream(
			channel.channel,
			read.open,
			eventOf,
			closedEvent,
		)
		const { send, resent } = read.opened()
		const opening: LiveMessage = {
			kind: 'reset',
			revision: 1,
			rows: Array.from({ length: 10 }, (_, index) => ({ id: `${index}` })),
			hasMore: false,
		}
		send(opening)
		channel.full = true
		const change: LiveMessage = {
			kind: 'changes',
			revision: 2,
			changes: [{ remove: '1', gone: true }],
		}
		send(change)
		expect(channel.drains).toHaveLength(0)
		expect(resent()).toBe(0)
		send({ kind: 'closed' })
		expect(await rootsOf(stream)).toEqual([opening, change, 'closed'])
	})

	it('drops rows and values too while the socket is full, and waits once', async () => {
		const channel = fake(await viewer())
		const read = handled()
		const stream = await liveStream(
			channel.channel,
			read.open,
			eventOf,
			closedEvent,
		)
		const { send, resent } = read.opened()
		send(valued(1))
		channel.full = true
		for (let revision = 2; revision <= 4; revision += 1) {
			send({ kind: 'row', revision, row: null })
			send(valued(revision))
		}
		expect(channel.drains).toHaveLength(1)
		channel.full = false
		for (const then of channel.drains) then()
		expect(resent()).toBe(1)
		send(valued(5))
		send({ kind: 'closed' })
		expect(await rootsOf(stream)).toEqual([valued(5), 'closed'])
	})

	it('asks for the window once opened when the socket drained before', async () => {
		const channel = fake(await viewer())
		const read = handled()
		channel.full = true
		const stream = liveStream(
			channel.channel,
			async (send) => {
				send(reset(1))
				for (const then of channel.drains) then()
				return read.open(send)
			},
			eventOf,
			closedEvent,
		)
		await stream
		expect(read.opened().resent()).toBe(1)
	})

	it('closes the socket when its viewer ended', async () => {
		const seen = await viewer()
		const channel = fake(seen)
		const read = handled()
		const stream = await liveStream(
			channel.channel,
			read.open,
			eventOf,
			closedEvent,
		)
		const { send, closed } = read.opened()
		const waiting = stream.next()
		seen.close()
		send({ kind: 'closed' })
		expect(await waiting).toEqual({ done: true, value: undefined })
		expect(channel.forbidden).toBe(1)
		expect(closed()).toBe(1)
	})

	it('closes its read when the client stops it', async () => {
		const channel = fake(await viewer())
		const read = handled()
		const stream = await liveStream(
			channel.channel,
			read.open,
			eventOf,
			closedEvent,
		)
		const { send, closed } = read.opened()
		send(reset(1))
		expect(await stream.return?.()).toEqual({ done: true, value: undefined })
		send(changed(2))
		expect(await stream.next()).toEqual({ done: true, value: undefined })
		expect(closed()).toBeGreaterThan(0)
		expect(stream[Symbol.asyncIterator]()).toBe(stream)
	})
})

const keepOf = (): Keep => ({ token: 't', signature: 's', first: 2 })

/** The root of the stream's next event. */
const rootOf = async (stream: AsyncIterableIterator<LiveEvent>) => {
	const next = await stream.next()
	return next.done === true ? undefined : next.value.root
}

/** A kept list's channel, its stream, read and keep, completed once. */
async function kept() {
	const channel = fake(await viewer())
	const read = handled()
	const keep = keepOf()
	const stream = await liveStream(
		channel.channel,
		read.open,
		eventOf,
		closedEvent,
		keep,
	)
	const { send } = read.opened()
	send(reset(1))
	expect(await rootOf(stream)).toEqual(reset(1))
	const waiting = stream.next()
	await stream.return?.()
	expect(await waiting).toEqual({ done: true, value: undefined })
	return { channel, read: read.opened(), stream, keep }
}

describe('a completed live list', () => {
	it('is kept, its changes waiting, until a resume grows it', async () => {
		const { channel, read, stream, keep } = await kept()
		read.send(changed(2))
		expect(channel.channel.kept.get('t')?.stream).toBe(stream)
		expect(await resumed(channel.channel, 't', 's', 5)).toBe(stream)
		expect(read.grown).toEqual([3])
		expect(keep.first).toBe(5)
		expect(channel.channel.kept.size).toBe(0)
		expect(await rootOf(stream)).toEqual(changed(2))
		expect(read.closed()).toBe(0)
		// A list resumed with the rows it shows is not grown.
		await stream.return?.()
		expect(await resumed(channel.channel, 't', 's', 5)).toBe(stream)
		expect(read.grown).toEqual([3])
	})

	it('is not taken by another read, fewer rows or another token', async () => {
		const { channel, stream } = await kept()
		expect(await resumed(channel.channel, 't', 'other', 2)).toBeUndefined()
		expect(await resumed(channel.channel, 't', 's', 1)).toBeUndefined()
		expect(await resumed(channel.channel, 'u', 's', 2)).toBeUndefined()
		expect(channel.channel.kept.get('t')?.stream).toBe(stream)
	})

	it('stays kept as it was when a resume grows it past a limit', async () => {
		const { channel, read, stream, keep } = await kept()
		await expect(resumed(channel.channel, 't', 's', 20)).rejects.toThrow(
			'Too many rows.',
		)
		expect(read.closed()).toBe(0)
		expect(channel.channel.kept.get('t')?.stream).toBe(stream)
		expect(await resumed(channel.channel, 't', 's', keep.first)).toBe(stream)
	})

	it('ends after 10 seconds, completed twice or not', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		try {
			const { channel, read, stream } = await kept()
			await stream.return?.()
			vi.advanceTimersByTime(9999)
			expect(read.closed()).toBe(0)
			vi.advanceTimersByTime(1)
			expect(read.closed()).toBe(1)
			expect(channel.channel.kept.size).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('is not kept once its read closed or its viewer ended', async () => {
		const seen = await viewer()
		const channel = fake(seen)
		const read = handled()
		const closing = await liveStream(
			channel.channel,
			read.open,
			eventOf,
			closedEvent,
			keepOf(),
		)
		read.opened().send({ kind: 'closed' })
		await closing.return?.()
		expect(channel.channel.kept.size).toBe(0)
		const other = handled()
		const ended = await liveStream(
			channel.channel,
			other.open,
			eventOf,
			closedEvent,
			keepOf(),
		)
		seen.close()
		await ended.return?.()
		expect(channel.channel.kept.size).toBe(0)
		expect(other.opened().closed()).toBe(1)
	})
})

describe('a sent message', () => {
	it('lets go of its rows, which graphql-js keeps until the next (D-253)', () => {
		const event = new LiveEvent({ rows: [1] }, (result) => ({
			...result,
			extensions: { revision: 1 },
		}))
		expect(event.finish({ data: {} })).toEqual({
			data: {},
			extensions: { revision: 1 },
		})
		expect(event.root).toBeUndefined()
		expect(event.finish({ data: {} })).toEqual({ data: {} })
	})

	it('sends a result whole and leaves it no data (D-253)', () => {
		const result = { data: { a: 1 }, extensions: { b: 2 } }
		expect(released(result)).toEqual({ data: { a: 1 }, extensions: { b: 2 } })
		expect(result).toEqual({ data: null, extensions: { b: 2 } })
	})
})

const running = () => ({
	execute: vi.fn<() => ExecutionResult>(() => ({ data: { a: 1 } })),
	together: new SharedResults(),
})

const below = (source: string, values?: Record<string, unknown>) => {
	const document = parse(source)
	const operation = getOperationAST(document)
	if (!operation) throw new Error('No operation.')
	return variablesBelowRoot(document, operation, values)
}

describe('the variables below the root (D-267)', () => {
	it('leaves out what only chose the rows', () => {
		expect(
			below('subscription ($w: W) { tasks(where: $w) { id } }', { w: 1 }),
		).toEqual([])
	})

	it('names what a selection, a directive or a fragment reads', () => {
		expect(
			below(
				`subscription ($a: A, $b: B, $c: C, $d: D) {
					tasks(where: $a) @include(if: $b) { id @skip(if: $c) ...Part }
				}
				fragment Part on Task { name(as: $d) }`,
				{ a: 1, b: 2, c: 3, d: 4 },
			),
		).toEqual([
			['b', 2],
			['c', 3],
			['d', 4],
		])
	})

	it('reads a root selection that is no field whole', () => {
		expect(
			below('subscription ($a: A) { ... @include(if: $a) { tasks { id } } }'),
		).toEqual([['a', undefined]])
	})
})

describe('the results subscriptions run alike (D-265)', () => {
	it('runs one row once for one selection', async () => {
		const { execute, together } = running()
		const [first, second] = await Promise.all([
			together.run('shape', { id: 'a' }, execute),
			together.run('shape', { id: 'a' }, execute),
		])
		expect(execute).toHaveBeenCalledOnce()
		expect(second).toBe(first)
	})

	it('runs again for another row or another selection', async () => {
		const { execute, together } = running()
		await together.run('shape', { id: 'a' }, execute)
		await together.run('shape', { id: 'b' }, execute)
		await together.run('other', { id: 'a' }, execute)
		expect(execute).toHaveBeenCalledTimes(3)
	})

	it('forgets its results as the loop turns', async () => {
		const { execute, together } = running()
		await together.run('shape', { id: 'a' }, execute)
		await new Promise((resolve) => setImmediate(resolve))
		await together.run('shape', { id: 'a' }, execute)
		expect(execute).toHaveBeenCalledTimes(2)
	})

	it('runs a root with no JSON once too', async () => {
		const { execute, together } = running()
		await together.run('shape', undefined, execute)
		await together.run('shape', undefined, execute)
		expect(execute).toHaveBeenCalledOnce()
	})
})

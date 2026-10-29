// A live read's stream (D-154): changes a full socket cannot take are dropped
// until its window is sent again, and its end closes the read, or the socket
// when the viewer ended.
import type { LiveHandle, LiveMessage, Viewer } from '@ultimabase/realtime'
import { realtimePlugin } from '@ultimabase/realtime'
import type { RealtimeApi, Realtime } from '@ultimabase/realtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import type { Channel } from './live-stream.ts'
import { LiveEvent, liveStream } from './live-stream.ts'

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
		},
	}
	return state
}

type Opened = {
	readonly send: (message: LiveMessage) => void
	readonly resent: () => number
	readonly closed: () => number
}

/** A read's handle, counting what the stream asks of it. */
function handled(): {
	readonly open: (send: (message: LiveMessage) => void) => Promise<LiveHandle>
	readonly opened: () => Opened
} {
	let send: ((message: LiveMessage) => void) | undefined
	let resent = 0
	let closed = 0
	const handle: LiveHandle = {
		grow: async () => undefined,
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
			return { send: sent, resent: () => resent, closed: () => closed }
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

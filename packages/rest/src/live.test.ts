// Live reads over Server-Sent Events (D-154): a live model's list and row URL
// with `Accept: text/event-stream` send the read as `event: data`, then what
// changed as `event: live`, gzipped when the client takes it, within the
// limits, and end with the read, with their caller and with the application.
import { httpPlugin } from '@ultimabase/http'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type {
	LiveHandle,
	LiveMessage,
	Realtime,
	RealtimeApi,
	RealtimeOptions,
	Viewer,
} from '@ultimabase/realtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Caller, Identity, Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { RestOptions } from './index.ts'
import { rest, restPlugin } from './index.ts'
import { wantsEvents } from './live.ts'
import type { Sink } from './streams.ts'
import { follow } from './streams.ts'
import { acceptsGzip, eventsTo } from './sse.ts'

const M = { as: master }

const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

let failing = false
let held: Promise<void> | undefined

const Project = defineModel({
	name: 'Project',
	use: [rest()],
	fields: (f) => ({ name: f.string(), tasks: f.many(() => Task) }),
}).with({ access: allow.readOnly })

/** A user reads their own tasks. */
const Task = defineModel({
	name: 'Task',
	use: [rest(), realtime()],
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		owner: f.string(),
		project: f.one(() => Project, { optional: true }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ owner: idOf(caller) }),
	},
	rest: { maxTake: 3 },
	hooks: {
		beforeFind: async ({ caller }) => {
			if (caller.kind === 'master') return
			if (failing) throw new Error('Broken.')
			await held
		},
	},
})

const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({ text: f.string() }),
}).with({ access: allow.readOnly })

const errors: unknown[] = []
let listening = ''
const logger: Logger = {
	info: (first: string | object) => {
		if (typeof first === 'string' && first.startsWith('Listening on')) {
			listening = first.replace(/^Listening on (.*)\.$/, '$1')
		}
	},
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		errors.push(message ?? first)
	},
	child: () => logger,
}

const revoked = new Set<string>()
interface Sessions extends PluginTypes {
	readonly name: 'sessions'
}
/** A request's `authorization` is its user's id. */
const sessions = definePlugin<Sessions>({
	name: 'sessions',
	manifest: {
		name: 'sessions',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	identify: async (request): Promise<Identity | undefined> => {
		const id = request.headers.get('authorization')
		if (id === null || revoked.has(id)) return undefined
		return { kind: 'user', user: { id } }
	},
})

let stop: (() => Promise<void>) | undefined
const opened: AbortController[] = []
afterEach(async () => {
	for (const controller of opened.splice(0)) controller.abort()
	await stop?.()
	stop = undefined
	errors.length = 0
	revoked.clear()
	failing = false
	held = undefined
})

type Options = {
	readonly rest?: RestOptions
	/** `false` leaves realtime out, and the live model with it. */
	readonly realtime?: RealtimeOptions | false
}

/** Starts the application; returns its API's URL. */
async function started(options: Options = {}): Promise<string> {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			...(options.realtime === false ? [] : [realtimePlugin(options.realtime)]),
			restPlugin(options.rest),
			sessions.plugin(),
		],
		models: options.realtime === false ? [Note] : [Task, Project, Note],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	return `${listening}/api`
}

/** Ada's three tasks and Bob's one. */
async function seeded(): Promise<readonly string[]> {
	const ids: string[] = []
	for (const [rank, title, owner] of [
		[1, 'a', 'ada'],
		[2, 'b', 'ada'],
		[3, 'c', 'ada'],
		[1, 'x', 'bob'],
	] as const) {
		const task = await Task.create({ data: { title, rank, owner } }, M)
		ids.push(task.id)
	}
	return ids
}

/** A query string: each string as is, any other value as JSON (D-129). */
const qs = (params: { readonly [name: string]: unknown }): string =>
	`?${new URLSearchParams(
		Object.entries(params).map(([name, value]): [string, string] => [
			name,
			typeof value === 'string' ? value : JSON.stringify(value),
		]),
	).toString()}`

type Event = {
	readonly event: string
	readonly data: unknown
	readonly id?: number
}

type Stream = {
	readonly response: Response
	/** The next event, or `undefined` once the stream ended. */
	readonly next: () => Promise<Event | undefined>
	/** The next raw text the server sent. */
	readonly raw: () => Promise<string>
	/** Leaves, as a closed tab does. */
	readonly leave: () => void
	/** The token of the `resume` event `next` read past, if any. */
	readonly token: () => string | undefined
}

/** An SSE request of `url`, as Ada unless `headers` say otherwise. */
async function streaming(
	url: string,
	headers: Record<string, string> = {},
): Promise<Stream> {
	const controller = new AbortController()
	opened.push(controller)
	const response = await fetch(url, {
		headers: { accept: 'text/event-stream', authorization: 'ada', ...headers },
		signal: controller.signal,
	})
	const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
	let buffer = ''
	let token: string | undefined
	const raw = async () => {
		const read = await reader?.read()
		return read === undefined || read.done ? '' : read.value
	}
	const next = async (): Promise<Event | undefined> => {
		for (;;) {
			const end = buffer.indexOf('\n\n')
			if (end >= 0) {
				const block = buffer.slice(0, end)
				buffer = buffer.slice(end + 2)
				const fields = new Map(
					block
						.split('\n')
						.filter((line) => !line.startsWith(':'))
						.map((line): [string, string] => {
							const at = line.indexOf(': ')
							return [line.slice(0, at), line.slice(at + 2)]
						}),
				)
				const event = fields.get('event')
				if (event === undefined) continue
				const id = fields.get('id')
				const data: unknown = JSON.parse(fields.get('data') ?? 'null')
				if (event === 'resume' && typeof data === 'string') {
					token = data
					continue
				}
				return { event, data, ...(id !== undefined && { id: Number(id) }) }
			}
			const more = await raw()
			if (more === '') return undefined
			buffer += more
		}
	}
	return {
		response,
		next,
		raw,
		leave: () => controller.abort(),
		token: () => token,
	}
}

/** A JSON response's status and body. */
async function answered(
	url: string,
	headers: Record<string, string> = {},
): Promise<{ readonly status: number; readonly body: unknown }> {
	const response = await fetch(url, {
		headers: { accept: 'text/event-stream', authorization: 'ada', ...headers },
	})
	return { status: response.status, body: await response.json() }
}

const revision: unknown = expect.any(Number)
const cursor: unknown = expect.any(String)
const anId: unknown = expect.any(String)
const asMaster = { 'x-ultimabase-master-key': 'secret' }
const ranked = {
	orderBy: [{ rank: 'asc' }],
	select: { id: true, title: true },
}

describe('a live list', () => {
	it('sends its window, then only what changed', async () => {
		const api = await started()
		const [a = '', b = ''] = await seeded()
		const stream = await streaming(
			`${api}/tasks${qs({ ...ranked, first: 2, totalCount: true })}`,
		)
		expect(stream.response.headers.get('content-type')).toBe(
			'text/event-stream; charset=utf-8',
		)
		const first = await stream.next()
		expect(first).toEqual({
			event: 'data',
			id: revision,
			data: {
				edges: [
					{ cursor, node: { id: a, title: 'a' } },
					{ cursor, node: { id: b, title: 'b' } },
				],
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: cursor,
					endCursor: cursor,
				},
				totalCount: 3,
			},
		})
		const zed = await Task.create(
			{ data: { title: 'z', rank: 0, owner: 'ada' } },
			M,
		)
		const second = await stream.next()
		expect(second).toEqual({
			event: 'live',
			id: (first?.id ?? 0) + 1,
			data: {
				revision: (first?.id ?? 0) + 1,
				changes: [
					{ remove: b, gone: false },
					{ upsert: { cursor, node: { id: zed.id, title: 'z' } }, after: null },
				],
				totalCount: 4,
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: cursor,
					endCursor: cursor,
				},
			},
		})
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await stream.next()).toEqual({
			event: 'live',
			id: revision,
			data: {
				revision,
				changes: [
					{ upsert: { cursor, node: { id: a, title: 'A' } }, after: zed.id },
				],
			},
		})
	})

	it('is the rows themselves under list pagination', async () => {
		const api = await started({ rest: { pagination: 'list' } })
		const [, b = ''] = await seeded()
		const stream = await streaming(`${api}/tasks${qs({ ...ranked, take: 2 })}`)
		expect(await stream.next()).toEqual({
			event: 'data',
			id: revision,
			data: [
				{ id: anId, title: 'a' },
				{ id: b, title: 'b' },
			],
		})
		const zed = await Task.create(
			{ data: { title: 'z', rank: 0, owner: 'ada' } },
			M,
		)
		expect(await stream.next()).toEqual({
			event: 'live',
			id: revision,
			data: {
				revision,
				changes: [
					{ remove: b, gone: false },
					{ upsert: { id: zed.id, title: 'z' }, after: null },
				],
			},
		})
	})

	it('in page mode, sends its whole window each time', async () => {
		const api = await started({ rest: { pagination: 'list' } })
		const [a = ''] = await seeded()
		const stream = await streaming(
			`${api}/tasks${qs({ ...ranked, take: 2, mode: 'page' })}`,
		)
		await stream.next()
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await stream.next()).toEqual({
			event: 'data',
			id: revision,
			data: [
				{ id: a, title: 'A' },
				{ id: anId, title: 'b' },
			],
		})
	})

	it('of Master without first follows take rows', async () => {
		const api = await started()
		await seeded()
		const stream = await streaming(`${api}/tasks${qs(ranked)}`, asMaster)
		const sent = await stream.next()
		expect(sent?.data).toEqual(
			expect.objectContaining({
				edges: ['a', 'x', 'b', 'c'].map((title) => ({
					cursor,
					node: { id: anId, title },
				})),
			}),
		)
	})

	it('sends an error, then ends, when the engine closes it', async () => {
		const api = await started()
		await seeded()
		const stream = await streaming(`${api}/tasks${qs(ranked)}`)
		await stream.next()
		failing = true
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(await stream.next()).toEqual({
			event: 'error',
			data: { code: 'INTERNAL', message: 'The live read closed.' },
		})
		expect(await stream.next()).toBeUndefined()
	})

	it('ends, without an error, once its caller is no longer the same', async () => {
		const api = await started({ realtime: { refresh: 20 } })
		await seeded()
		const stream = await streaming(`${api}/tasks${qs(ranked)}`)
		await stream.next()
		revoked.add('ada')
		expect(await stream.next()).toBeUndefined()
	})

	it('ends when the application stops', async () => {
		const api = await started()
		const stream = await streaming(`${api}/tasks`)
		await stream.next()
		await stop?.()
		stop = undefined
		expect(await stream.next()).toBeUndefined()
	})

	it('follows nothing once its client left during its first read', async () => {
		const api = await started()
		let release: (() => void) | undefined
		held = new Promise((done) => {
			release = done
		})
		const controller = new AbortController()
		const response = fetch(`${api}/tasks`, {
			headers: { accept: 'text/event-stream', authorization: 'ada' },
			signal: controller.signal,
		})
		await new Promise((done) => setTimeout(done, 20))
		controller.abort()
		await expect(response).rejects.toThrow('This operation was aborted')
		// The server sees its client leave a few milliseconds later.
		await new Promise((done) => setTimeout(done, 100))
		release?.()
		await new Promise((done) => setTimeout(done, 20))
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(errors).toEqual([])
	})
})

const waited = async (ms: number) =>
	new Promise((done) => {
		setTimeout(done, ms)
	})

/** The token of Ada's first two tasks, read live, then left. */
async function left(api: string): Promise<string> {
	const stream = await streaming(`${api}/tasks${qs({ ...ranked, first: 2 })}`)
	await stream.next()
	stream.leave()
	// The server sees its client leave a few milliseconds later.
	await waited(100)
	const token = stream.token()
	if (token === undefined) throw new Error('No resume token.')
	return token
}

/** The first event of `url`'s stream, and the token it carries. */
async function begun(url: string, headers: Record<string, string> = {}) {
	const stream = await streaming(url, headers)
	const { event } = (await stream.next()) ?? {}
	return { event, token: stream.token() }
}

describe('a resumed live list', () => {
	it('sends what changed since its client left, then only its new rows', async () => {
		const api = await started()
		const [a = '', b = '', c = ''] = await seeded()
		const token = await left(api)
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		// The change reaches the kept list after the engine's 50 ms.
		await waited(150)
		const stream = await streaming(
			`${api}/tasks${qs({ ...ranked, first: 3, resume: token })}`,
		)
		expect(await stream.next()).toEqual({
			event: 'live',
			id: revision,
			data: {
				revision,
				changes: [
					{ upsert: { cursor, node: { id: a, title: 'A' } }, after: null },
				],
			},
		})
		// Its token came first, the same.
		expect(stream.token()).toBe(token)
		expect(await stream.next()).toEqual({
			event: 'live',
			id: revision,
			data: {
				revision,
				changes: [
					{ upsert: { cursor, node: { id: c, title: 'c' } }, after: b },
				],
				pageInfo: {
					hasNextPage: false,
					hasPreviousPage: false,
					startCursor: cursor,
					endCursor: cursor,
				},
			},
		})
	})

	it('starts afresh as another read, token or user', async () => {
		const api = await started()
		const [a = ''] = await seeded()
		const token = await left(api)
		const another: unknown = expect.toSatisfy(
			(other: unknown) => typeof other === 'string' && other !== token,
		)
		const fresh = { event: 'data', token: another }
		for (const params of [
			{ ...ranked, orderBy: [{ rank: 'desc' }], first: 2, resume: token },
			{ ...ranked, first: 1, resume: token },
			{ ...ranked, first: 2, resume: 'unknown' },
		]) {
			expect(await begun(`${api}/tasks${qs(params)}`)).toEqual(fresh)
		}
		expect(await begun(`${api}/tasks/${a}${qs({ resume: token })}`)).toEqual({
			event: 'data',
			token: undefined,
		})
		const same = `${api}/tasks${qs({ ...ranked, first: 2, resume: token })}`
		// Another user ends the kept list, which its own user no longer finds.
		expect(await begun(same, { authorization: 'bob' })).toEqual(fresh)
		expect(await begun(same)).toEqual(fresh)
	})

	it('is refused past its limit', async () => {
		const api = await started({ realtime: { maxLive: 2 } })
		await seeded()
		const token = await left(api)
		const resumed = qs({ ...ranked, first: 3, resume: token })
		const { status, body } = await answered(`${api}/tasks${resumed}`)
		expect(status).toBe(400)
		expect(body).toMatchObject({
			code: 'VALIDATION_FAILED',
			message: 'first is over 2, the most a live list follows.',
		})
	})

	it('is no longer kept once the application stops', async () => {
		const api = await started()
		await seeded()
		await left(api)
		await stop?.()
		stop = undefined
		expect(errors).toEqual([])
	})
})

describe('a live row', () => {
	it('sends the row each time it changes, and null once gone', async () => {
		const api = await started()
		const [a = ''] = await seeded()
		const stream = await streaming(
			`${api}/tasks/${a}${qs({ select: { title: true } })}`,
		)
		expect(await stream.next()).toEqual({
			event: 'data',
			id: revision,
			data: { title: 'a' },
		})
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await stream.next()).toEqual({
			event: 'data',
			id: revision,
			data: { title: 'A' },
		})
		await Task.delete({ where: { id: a } }, M)
		expect(await stream.next()).toEqual({
			event: 'data',
			id: revision,
			data: null,
		})
	})
})

describe('the live reads', () => {
	it('are the live models’ only', async () => {
		const api = await started()
		expect(await answered(`${api}/notes`)).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: 'Note is not live: list realtime() in its use.',
			},
		})
	})

	it('are not served without the realtime plugin', async () => {
		const api = await started({ realtime: false })
		const { status } = await answered(`${api}/notes/x`)
		expect(status).toBe(400)
	})

	it('take a window from the top of its order', async () => {
		const api = await started()
		const refused = [
			[{ after: 'x' }, "Unknown query parameter 'after'"],
			[{ totalCount: 1 }, 'totalCount must be true or false.'],
			[{ mode: 'all' }, 'mode must be page.'],
			[{ first: 4 }, 'first is at most 3 on Task.'],
		] as const
		for (const [params, message] of refused) {
			const { status, body } = await answered(`${api}/tasks${qs(params)}`)
			expect(status).toBe(400)
			expect(JSON.stringify(body)).toContain(message)
		}
	})

	it('in page mode, follow at most maxTake rows, even as Master', async () => {
		const api = await started()
		const { body } = await answered(
			`${api}/tasks${qs({ first: 4, mode: 'page' })}`,
			asMaster,
		)
		expect(JSON.stringify(body)).toContain(
			'first is at most 3 on Task in page mode.',
		)
	})

	it('nest at most maxDepth levels, and reach live models only', async () => {
		const api = await started({ rest: { maxDepth: 1 } })
		const include = qs({ include: { project: true } })
		const deep = await answered(`${api}/tasks${include}`)
		expect(JSON.stringify(deep.body)).toContain('nested 2 levels deep')
		const reached = await answered(`${api}/tasks${include}`, asMaster)
		expect(reached.status).toBe(400)
		expect(JSON.stringify(reached.body)).toContain('Project')
	})

	it('are gzipped when the client takes gzip, flushed after each event', async () => {
		const api = await started()
		const zipped = await streaming(`${api}/tasks`, {
			'accept-encoding': 'gzip',
		})
		expect(zipped.response.headers.get('content-encoding')).toBe('gzip')
		expect(await zipped.next()).toEqual(
			expect.objectContaining({ event: 'data' }),
		)
		const plain = await streaming(`${api}/tasks`, {
			'accept-encoding': 'identity',
		})
		expect(plain.response.headers.get('content-encoding')).toBeNull()
		expect(await plain.next()).toEqual(
			expect.objectContaining({ event: 'data' }),
		)
	})

	it('send a comment every 12 s', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
		try {
			const api = await started()
			const stream = await streaming(`${api}/tasks`, {
				'accept-encoding': 'identity',
			})
			await stream.next()
			vi.advanceTimersByTime(12_000)
			expect(await stream.raw()).toBe(':\n\n')
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('acceptsGzip', () => {
	it('reads an Accept-Encoding header', () => {
		expect(acceptsGzip(null)).toBe(false)
		expect(acceptsGzip('br, GZIP')).toBe(true)
		expect(acceptsGzip('gzip;q=0.5')).toBe(true)
		expect(acceptsGzip('gzip;q=0')).toBe(false)
		expect(acceptsGzip('deflate')).toBe(false)
	})
})

describe('eventsTo', () => {
	it('is full past 1 MiB the client did not take, until it takes it', async () => {
		let closed = 0
		const events = eventsTo(new Request('http://localhost/'), () => {
			closed += 1
		})
		events.send('data', 'x'.repeat(2 * 1024 * 1024))
		expect(events.full()).toBe(true)
		const drained = new Promise<void>((done) => events.drained(done))
		const text = events.response.text()
		await drained
		expect(events.full()).toBe(false)
		events.end()
		expect((await text).length).toBeGreaterThan(2 * 1024 * 1024)
		expect(closed).toBe(1)
	})

	it('runs what waits for a drain at once when nothing is held', () => {
		const events = eventsTo(new Request('http://localhost/'), () => undefined)
		let ran = false
		events.drained(() => {
			ran = true
		})
		events.end()
		expect(ran).toBe(true)
	})
})

describe('wantsEvents', () => {
	it('reads an Accept header', () => {
		expect(wantsEvents(new Request('http://localhost/'))).toBe(false)
		const asking = { headers: { accept: 'text/event-stream' } }
		expect(wantsEvents(new Request('http://localhost/', asking))).toBe(true)
	})
})

interface Keeping extends PluginTypes {
	readonly name: 'keeping'
	readonly requires: Realtime
}
let kept: RealtimeApi | undefined
const keeping = definePlugin<Keeping>({
	name: 'keeping',
	manifest: {
		name: 'keeping',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		kept = plugins.realtime
	},
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
	if (kept === undefined) throw new Error('No realtime API.')
	return kept.connect(new Request('http://localhost/'))
}

type Fake = {
	readonly sink: Sink
	full: boolean
	readonly sent: string[]
	readonly drains: (() => void)[]
	ended: number
}

function fake(): Fake {
	const state: Fake = {
		full: false,
		sent: [],
		drains: [],
		ended: 0,
		sink: {
			send: (event, data) => {
				state.sent.push(`${event} ${JSON.stringify(data)}`)
			},
			full: () => state.full,
			drained: (then) => {
				state.drains.push(then)
			},
			end: () => {
				state.ended += 1
			},
		},
	}
	return state
}

const shape = { fields: [], sorted: 0 }
const reset = (at: number): LiveMessage => ({
	kind: 'reset',
	revision: at,
	rows: [],
	hasMore: false,
})
const changes = (at: number): LiveMessage => ({
	kind: 'changes',
	revision: at,
	changes: [],
})
const ignored = (): void => undefined

describe('follow', () => {
	it('drops changes while the buffer is full, until the window comes again', async () => {
		const seen = await viewer()
		const state = fake()
		let resent = 0
		let send: (message: LiveMessage) => void = ignored
		const handle: LiveHandle = {
			grow: async () => undefined,
			resend: async () => {
				resent += 1
			},
			close: () => undefined,
		}
		await follow(
			state.sink,
			seen,
			shape,
			async (_, taking) => {
				send = taking
				return handle
			},
			(sink) => (message) => sink.send(message.kind, message.revision),
		)
		send(reset(1))
		state.full = true
		send(changes(2))
		send(changes(3))
		expect(state.drains).toHaveLength(1)
		state.full = false
		state.drains[0]?.()
		expect(resent).toBe(1)
		send(reset(4))
		send(changes(5))
		expect(state.sent).toEqual(['reset 1', 'reset 4', 'changes 5'])
	})

	it('asks for the window once open when the buffer filled before', async () => {
		const seen = await viewer()
		const state = fake()
		let resent = 0
		await follow(state.sink, seen, shape, async (_, send) => {
			state.full = true
			send({ kind: 'row', revision: 1, row: null })
			state.drains[0]?.()
			return {
				grow: async () => undefined,
				resend: async () => {
					resent += 1
				},
				close: () => undefined,
			}
		})
		expect(resent).toBe(1)
	})

	it('ends without an error once its viewer closed', async () => {
		const seen = await viewer()
		const state = fake()
		let send: (message: LiveMessage) => void = ignored
		await follow(state.sink, seen, shape, async (_, taking) => {
			send = taking
			return {
				grow: async () => undefined,
				resend: async () => undefined,
				close: () => undefined,
			}
		})
		seen.close()
		send({ kind: 'closed' })
		expect(state.sent).toEqual([])
		expect(state.ended).toBe(1)
	})
})

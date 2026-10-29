// Subscriptions over WebSocket (D-154): graphql-ws on the GraphQL path when
// the realtime plugin runs, a list's first result `{ data }` and then only
// what changed under `extensions.live`, page mode, the limits, and the
// socket closing with its caller and with the application.
import { httpPlugin } from '@ultimabase/http'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { RealtimeOptions } from '@ultimabase/realtime'
import type { GraphQLSchema } from 'graphql'
import { parse, subscribe } from 'graphql'
import type { Client, FormattedExecutionResult } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { z } from 'zod'
import type { Caller, Identity, Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { GraphqlOptions } from './index.ts'
import { graphql, graphqlPlugin } from './index.ts'

const M = { as: master }

const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

let failing = false
/** A user reads their own tasks. */
const Task = defineModel({
	name: 'Task',
	use: [graphql(), realtime()],
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		owner: f.string(),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ owner: idOf(caller) }),
	},
	graphql: { maxTake: 3 },
	hooks: {
		beforeFind: ({ caller }) => {
			if (failing && caller.kind !== 'master') throw new Error('Broken.')
		},
	},
})
const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({ text: f.string() }),
}).with({ access: allow.readOnly })

const cookie = defineFunction({
	name: 'cookie',
	query: true,
	output: z.string().nullable(),
	run: ({ client }) => client?.cookies.get('session') ?? null,
}).with({ access: allow.public })
const remember = defineFunction({
	name: 'remember',
	output: z.boolean(),
	run: ({ client }) => {
		client?.cookies.set('seen', 'yes')
		return true
	},
}).with({ access: allow.public })

const errors: unknown[] = []
const failures: unknown[] = []
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
		failures.push(first)
	},
	child: () => logger,
}

const revoked = new Set<string>()
let held: Promise<void> | undefined
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
		if (id === 'broken') throw new Error('Identify broke.')
		if (id === 'slow') await held
		if (id === null || revoked.has(id)) return undefined
		return { kind: 'user', user: { id } }
	},
})

let stop: (() => Promise<void>) | undefined
const clients: Client[] = []
afterEach(async () => {
	for (const client of clients.splice(0)) await client.dispose()
	await stop?.()
	stop = undefined
	errors.length = 0
	failures.length = 0
	revoked.clear()
	failing = false
	held = undefined
})

type Options = {
	readonly graphql?: GraphqlOptions
	readonly realtime?: RealtimeOptions | false
	readonly models?: readonly (typeof Task | typeof Note)[]
}

let schema: GraphQLSchema | undefined
/** Starts the application; returns its WebSocket URL. */
async function started(options: Options = {}): Promise<string> {
	const plugins = [
		httpPlugin({ port: 0 }),
		...(options.realtime === false ? [] : [realtimePlugin(options.realtime)]),
		graphqlPlugin({
			...options.graphql,
			extend: (built) => {
				schema = built
				return built
			},
		}),
		sessions.plugin(),
	]
	const app = defineApp({
		database: memory(),
		plugins,
		models: options.models ?? [Task, Note],
		functions: [cookie, remember],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	return `${listening.replace(/^http/, 'ws')}${options.graphql?.path ?? '/graphql'}`
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

type Closed = { readonly code: number; readonly reason: string }

/** A WebSocket whose upgrade request carries `headers`. */
const sending = (headers: Record<string, string>) =>
	class extends WebSocket {
		constructor(address: string, protocols?: string | string[]) {
			super(address, protocols, { headers })
		}
	}

/** A graphql-ws client of `url`, as `authorization`, sending `headers`. */
function opening(
	url: string,
	authorization: string | undefined = 'ada',
	headers: Record<string, string> = {},
) {
	const closes: Closed[] = []
	const opened = createClient({
		url,
		webSocketImpl: sending(headers),
		retryAttempts: 0,
		// A resume follows its completed list on the same socket.
		lazyCloseTimeout: 1000,
		connectionParams: authorization === undefined ? {} : { authorization },
		on: {
			closed: (event) => {
				closes.push({
					code: Number(Reflect.get(Object(event), 'code')),
					reason: String(Reflect.get(Object(event), 'reason')),
				})
			},
		},
	})
	clients.push(opened)
	return { ws: opened, closes }
}

type Results = AsyncIterableIterator<
	FormattedExecutionResult<Record<string, unknown>, unknown>
>

/** A subscription's results, as Ada unless `as` names another caller. */
function subscribed(
	url: string,
	query: string,
	extensions?: Record<string, unknown>,
	as?: string,
): Results {
	return opening(url, as).ws.iterate({
		query,
		...(extensions && { extensions }),
	})
}

const next = async (results: Results): Promise<unknown> =>
	(await results.next()).value

/** The rejection of the results' next, or `undefined`. */
async function failed(results: Results): Promise<unknown> {
	try {
		await results.next()
		return undefined
	} catch (error) {
		return error
	}
}

const revision: unknown = expect.any(Number)
const token: unknown = expect.any(String)
const anything: unknown = expect.anything()
const containing = (fields: object): unknown => expect.objectContaining(fields)
const tasks = `subscription { tasks(first: 2, orderBy: [{ rank: asc }]) {
	totalCount edges { node { id title } } pageInfo { hasNextPage }
} }`

describe('a live list', () => {
	it('sends its window, then only what changed', async () => {
		const url = await started()
		const [a = '', b = '', c = ''] = await seeded()
		const results = subscribed(url, tasks)
		expect(await next(results)).toEqual({
			data: {
				tasks: {
					totalCount: 3,
					edges: [
						{ node: { id: a, title: 'a' } },
						{ node: { id: b, title: 'b' } },
					],
					pageInfo: { hasNextPage: true },
				},
			},
			extensions: { live: { revision, resume: token } },
		})
		const zed = await Task.create(
			{ data: { title: 'z', rank: 0, owner: 'ada' } },
			M,
		)
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision,
					changes: [
						{ remove: b, gone: false },
						{ upsert: { node: { id: zed.id, title: 'z' } }, after: null },
					],
					totalCount: 4,
				},
			},
		})
		await Task.delete({ where: { id: a } }, M)
		await Task.create({ data: { title: 'y', rank: 1, owner: 'bob' } }, M)
		await Task.update({ where: { id: c }, data: { title: 'C' } }, M)
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision,
					changes: [
						{ remove: a, gone: true },
						{ upsert: { node: { id: b, title: 'b' } }, after: zed.id },
					],
					totalCount: 3,
				},
			},
		})
		await results.return?.()
	})

	it('sends its page info when it changes, and no changes without edges', async () => {
		const url = await started()
		await seeded()
		const results = subscribed(
			url,
			`subscription { all: tasks(first: 3) {
				count: totalCount info: pageInfo { more: hasNextPage }
			} }`,
		)
		expect(await next(results)).toEqual({
			data: { all: { count: 3, info: { more: false } } },
			extensions: { live: { revision, resume: token } },
		})
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(await next(results)).toEqual({
			extensions: {
				live: { revision, totalCount: 4, pageInfo: { more: true } },
			},
		})
		await results.return?.()
	})

	it('in page mode, sends its whole window each time', async () => {
		const url = await started()
		const [a = ''] = await seeded()
		const results = subscribed(url, tasks, { live: { mode: 'page' } })
		await next(results)
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await next(results)).toEqual({
			data: {
				tasks: {
					totalCount: 3,
					edges: [
						{ node: { id: a, title: 'A' } },
						{ node: containing({ title: 'b' }) },
					],
					pageInfo: { hasNextPage: true },
				},
			},
			extensions: { live: { revision } },
		})
		await results.return?.()
	})

	it('in page mode, follows at most maxTake rows, even as Master', async () => {
		const url = await started()
		const results = opening(url, undefined, {
			'x-ultimabase-master-key': 'secret',
		}).ws.iterate({
			query: 'subscription { tasks(first: 4) { totalCount } }',
			extensions: { live: { mode: 'page' } },
		})
		expect(await next(results)).toEqual({
			errors: [
				containing({
					message: 'first is at most 3 on Task in page mode.',
					extensions: { code: 'BAD_USER_INPUT' },
				}),
			],
		})
	})

	it('of Master without first follows take rows', async () => {
		const url = await started()
		await seeded()
		const results = opening(url, undefined, {
			'x-ultimabase-master-key': 'secret',
		}).ws.iterate({
			query: 'subscription { tasks { edges { node { title } } } }',
		})
		expect(await next(results)).toEqual({
			data: {
				tasks: {
					edges: ['a', 'b', 'c', 'x'].map((title) => ({ node: { title } })),
				},
			},
			extensions: { live: { revision, resume: token } },
		})
		await results.return?.()
	})

	it('is the rows themselves under list pagination', async () => {
		const url = await started({ graphql: { pagination: 'list' } })
		const [, b = ''] = await seeded()
		const results = subscribed(
			url,
			'subscription { tasks(take: 2, orderBy: [{ rank: asc }]) { title } }',
		)
		expect(await next(results)).toEqual({
			data: { tasks: [{ title: 'a' }, { title: 'b' }] },
			extensions: { live: { revision, resume: token } },
		})
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision,
					changes: [
						{ remove: b, gone: false },
						{ upsert: { title: 'z' }, after: null },
					],
				},
			},
		})
		await results.return?.()
	})

	it('sends an error, then completes, when the engine closes it', async () => {
		const url = await started()
		await seeded()
		const results = subscribed(url, tasks)
		await next(results)
		failing = true
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(await next(results)).toEqual({
			errors: [
				containing({
					message: 'The live read closed.',
					extensions: { code: 'INTERNAL' },
				}),
			],
		})
		expect((await results.next()).done).toBe(true)
		expect(errors).toEqual([
			'A live read of Task failed: it reads again.',
			'A live read of Task failed: it closes.',
		])
	})
})

const growing = `subscription ($first: Int, $order: SortOrder) {
	tasks(first: $first, orderBy: [{ rank: $order }]) {
		edges { node { title } } pageInfo { hasNextPage }
	}
}`

/** The token of Ada's first two tasks, read live then completed on `ws`. */
async function completed(ws: Client): Promise<string> {
	const results = ws.iterate({ query: growing, variables: { first: 2 } })
	const result = await next(results)
	await results.return?.()
	const extensions: unknown = Reflect.get(Object(result), 'extensions')
	const live: unknown = Reflect.get(Object(extensions), 'live')
	const resume: unknown = Reflect.get(Object(live), 'resume')
	if (typeof resume !== 'string') throw new Error('No resume token.')
	return resume
}

const waited = async (ms: number) =>
	new Promise((done) => {
		setTimeout(done, ms)
	})

describe('a resumed live list', () => {
	it('sends what changed since it completed, then only its new rows', async () => {
		const url = await started()
		const [a = '', b = ''] = await seeded()
		const { ws } = opening(url)
		const kept = await completed(ws)
		expect(a).not.toBe('')
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		// The change reaches the kept list after the engine's 50 ms.
		await waited(150)
		const results = ws.iterate({
			query: growing,
			variables: { first: 3 },
			extensions: { live: { resume: kept } },
		})
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision: 2,
					changes: [{ upsert: { node: { title: 'A' } }, after: null }],
				},
			},
		})
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision: 3,
					changes: [{ upsert: { node: { title: 'c' } }, after: b }],
					pageInfo: { hasNextPage: false },
				},
			},
		})
		await results.return?.()
	})

	it('starts afresh on another connection, read or token', async () => {
		const url = await started()
		await seeded()
		const { ws } = opening(url)
		const kept = await completed(ws)
		const fresh = containing({
			data: anything,
			extensions: { live: { revision: 1, resume: token } },
		})
		const resuming = { live: { resume: kept } }
		for (const [client, variables] of [
			[opening(url).ws, { first: 2 }],
			[ws, { first: 2, order: 'desc' }],
			[ws, { first: 1 }],
		] as const) {
			const results = client.iterate({
				query: growing,
				variables,
				extensions: resuming,
			})
			const result = await next(results)
			expect(result).toEqual(fresh)
			expect(result).not.toEqual(
				containing({ extensions: { live: containing(resuming.live) } }),
			)
			await results.return?.()
		}
		const row = ws.iterate({
			query: 'subscription { task(where: { id: "none" }) { title } }',
			extensions: resuming,
		})
		expect(await next(row)).toEqual({
			data: { task: null },
			extensions: { live: { revision: 1 } },
		})
		await row.return?.()
	})

	it('fails past its limit', async () => {
		const url = await started({ realtime: { maxLive: 2 } })
		await seeded()
		const { ws } = opening(url)
		const kept = await completed(ws)
		const results = ws.iterate({
			query: growing,
			variables: { first: 3 },
			extensions: { live: { resume: kept } },
		})
		expect(await next(results)).toEqual({
			errors: [
				containing({
					message: 'first is over 2, the most a live list follows.',
					extensions: containing({ code: 'VALIDATION_FAILED' }),
				}),
			],
		})
	})
})

describe('a live row', () => {
	it('sends the row each time it changes, and null once gone', async () => {
		const url = await started()
		const [a = ''] = await seeded()
		const results = subscribed(
			url,
			`subscription { task(where: { id: "${a}" }) { title } }`,
		)
		expect(await next(results)).toEqual({
			data: { task: { title: 'a' } },
			extensions: { live: { revision } },
		})
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await next(results)).toEqual({
			data: { task: { title: 'A' } },
			extensions: { live: { revision } },
		})
		await Task.delete({ where: { id: a } }, M)
		expect(await next(results)).toEqual({
			data: { task: null },
			extensions: { live: { revision } },
		})
		await results.return?.()
	})
})

describe('the subscriptions', () => {
	it('are the live models’ only', async () => {
		await started()
		const fields = schema?.getSubscriptionType()?.getFields() ?? {}
		expect(Object.keys(fields)).toEqual(['task', 'tasks'])
	})

	it('run over WebSocket only', async () => {
		await started()
		if (schema === undefined) throw new Error('No schema.')
		const result = await subscribe({
			schema,
			document: parse('subscription { tasks { totalCount } }'),
			contextValue: {},
		})
		expect(result).toEqual({
			errors: [
				containing({
					message: 'A subscription runs over WebSocket.',
				}),
			],
		})
	})

	it('hold at most maxSubscriptions per connection', async () => {
		const url = await started({ realtime: { maxSubscriptions: 1 } })
		const { ws } = opening(url)
		const first = ws.iterate({ query: tasks })
		await next(first)
		const second = ws.iterate({ query: tasks })
		expect(await next(second)).toEqual({
			errors: [
				containing({
					message: 'A connection holds at most 1 live reads.',
					extensions: containing({ code: 'VALIDATION_FAILED' }),
				}),
			],
		})
		await first.return?.()
	})

	it('follow at most maxConnectionRows per connection', async () => {
		const url = await started({ realtime: { maxConnectionRows: 1 } })
		expect(await next(subscribed(url, tasks))).toEqual({
			errors: [
				containing({
					message: 'A connection follows at most 1 rows.',
					extensions: containing({ code: 'VALIDATION_FAILED' }),
				}),
			],
		})
	})

	it('are not served without the realtime plugin', async () => {
		const url = await started({ realtime: false, models: [Note] })
		expect(schema?.getSubscriptionType()).toBeUndefined()
		const status = await new Promise((done) => {
			const socket = new WebSocket(url, 'graphql-transport-ws')
			socket.on('unexpected-response', (_, response) => {
				done(response.statusCode)
			})
		})
		expect(status).toBe(404)
	})
})

describe('a connection', () => {
	it('runs queries and mutations as over HTTP', async () => {
		const url = await started()
		await seeded()
		const { ws } = opening(url, 'ada', {
			cookie: 'bad=%E0; session=abc; session=other; =x; none',
		})
		const query = ws.iterate({
			query: '{ tasks { totalCount } cookie }',
		})
		expect(await next(query)).toEqual({
			data: { tasks: { totalCount: 3 }, cookie: 'abc' },
		})
		const mutation = ws.iterate({ query: 'mutation { remember }' })
		expect(await next(mutation)).toEqual({
			data: null,
			errors: [containing({ message: 'Internal error.' })],
		})
		expect(errors).toEqual(['A GraphQL field failed.'])
		expect(failures).toEqual([
			containing({
				err: new Error(
					'A cookie is set over HTTP: a WebSocket cannot set one.',
				),
			}),
		])
	})

	it('reads its caller from connection_init, over the upgrade’s', async () => {
		const url = await started()
		await seeded()
		const { ws } = opening(url, 'bob', { authorization: 'ada' })
		const results = ws.iterate({ query: tasks })
		expect(await next(results)).toEqual({
			data: {
				tasks: containing({ totalCount: 1 }),
			},
			extensions: { live: { revision, resume: token } },
		})
		await results.return?.()
	})

	it('refuses bad documents', async () => {
		const url = await started()
		const { ws } = opening(url)
		expect(await failed(ws.iterate({ query: 'subscription {' }))).toEqual([
			containing({
				message: 'Syntax Error: Expected Name, found <EOF>.',
			}),
		])
		expect(
			await failed(ws.iterate({ query: 'subscription { nope }' })),
		).toEqual([
			containing({
				message: 'Cannot query field "nope" on type "Subscription".',
			}),
		])
	})

	it('is refused when its caller is not read', async () => {
		const url = await started()
		const { ws, closes } = opening(url, 'broken')
		await failed(ws.iterate({ query: tasks }))
		expect(closes).toEqual([{ code: 4403, reason: 'Forbidden' }])
		expect(errors).toEqual(['A WebSocket caller was not read.'])
	})

	it('closes 4403 when its caller is no longer the same user', async () => {
		const url = await started({ realtime: { refresh: 20 } })
		await seeded()
		const { ws, closes } = opening(url)
		const results = ws.iterate({ query: tasks })
		await next(results)
		revoked.add('ada')
		await failed(results)
		expect(closes).toEqual([{ code: 4403, reason: 'Forbidden' }])
	})

	it('that leaves before its caller is read follows nothing', async () => {
		const url = await started()
		let release: (() => void) | undefined
		held = new Promise((done) => {
			release = done
		})
		const socket = new WebSocket(url, 'graphql-transport-ws')
		await new Promise((done) => socket.once('open', done))
		socket.send(
			JSON.stringify({
				type: 'connection_init',
				payload: { authorization: 'slow' },
			}),
		)
		socket.close()
		await new Promise((done) => socket.once('close', done))
		release?.()
		await new Promise((done) => setTimeout(done, 20))
		expect(errors).toEqual([])
	})

	it('compresses its messages', async () => {
		const url = await started()
		const socket = new WebSocket(url, 'graphql-transport-ws')
		await new Promise((done) => socket.once('open', done))
		expect(socket.extensions).toBe('permessage-deflate')
		socket.close()
	})

	it('that does not answer a ping is cut', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
		try {
			const url = await started()
			const silent = new WebSocket(url, 'graphql-transport-ws', {
				autoPong: false,
			})
			const answering = new WebSocket(url, 'graphql-transport-ws')
			await Promise.all(
				[silent, answering].map(
					async (socket) => new Promise((done) => socket.once('open', done)),
				),
			)
			vi.advanceTimersByTime(12_000)
			// The server reads the pong the client sent before this message.
			const acked = new Promise((done) => answering.once('message', done))
			answering.send(JSON.stringify({ type: 'connection_init' }))
			await acked
			const cut = new Promise((done) => silent.once('close', done))
			vi.advanceTimersByTime(12_000)
			expect(await cut).toBe(1006)
			expect(answering.readyState).toBe(WebSocket.OPEN)
			answering.close()
		} finally {
			vi.useRealTimers()
		}
	})

	it('is closed when the application stops', async () => {
		const url = await started()
		const { ws, closes } = opening(url)
		const results = ws.iterate({ query: tasks })
		await next(results)
		await stop?.()
		stop = undefined
		await failed(results)
		expect(closes).toEqual([{ code: 1001, reason: 'Going away' }])
	})
})

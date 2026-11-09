// Subscriptions over WebSocket (D-154): graphql-ws on the GraphQL path when
// the realtime plugin runs, a list's first result `{ data }` and then only
// what changed under `extensions.live`, page mode, the limits, and the
// socket closing with its caller and with the application.
import { createConnection } from 'node:net'
import type { Gate, Http, HttpApi, HttpOptions } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { RealtimeOptions } from '@ultimabase/realtime'
import type { GraphQLSchema } from 'graphql'
import { assertObjectType, extendSchema, parse, subscribe } from 'graphql'
import type { Client, FormattedExecutionResult } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RawData } from 'ws'
import { WebSocket } from 'ws'
import { z } from 'zod'
import type {
	Adapter,
	Caller,
	Identity,
	Logger,
	PluginTypes,
	Read,
} from 'ultimabase'
import {
	PublicError,
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { GraphqlOptions } from './index.ts'
import type { GraphqlContext } from './index.ts'
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
/** A board and its cards, followed live with their relation. */
const Board = defineModel({
	name: 'Board',
	use: [graphql(), realtime()],
	fields: (f) => ({ cards: f.many(() => Card, { inverse: 'board' }) }),
}).with({ access: allow.readOnly })
const Card = defineModel({
	name: 'Card',
	use: [graphql(), realtime()],
	fields: (f) => ({ board: f.one(() => Board) }),
}).with({ access: allow.readOnly })
/** `count` aliases of `field`, a row's id by default. */
const aliases = (count: number, field = 'id') =>
	Array.from({ length: count }, (_, i) => `a${i}: ${field}`).join(' ')
/** A live list refused for its values a row (D-349). */
const wideRefusal = {
	errors: [
		expect.objectContaining({
			message:
				'The document returns more than 50 values a row. Select fewer fields or aliases.',
			extensions: { code: 'BAD_USER_INPUT' },
		}),
	],
}
/**
 * Boards and their cards, each card with `count` aliases. A board and its
 * 2 cards are 3 rows, which return 10 values, then 2 an alias.
 */
const listed = (count: number) =>
	`subscription { boards(first: 2) { edges { node { id cards(first: 2) {
		edges { node { id ${aliases(count)} } } } } } } }`

const cookie = defineFunction({
	name: 'cookie',
	query: true,
	output: z.string().nullable(),
	run: ({ client }) => client?.cookies.get('session') ?? null,
}).with({ access: allow.public })
/** The caller's name, as their caller holds it. */
const named = defineFunction({
	name: 'named',
	query: true,
	output: z.string().nullable(),
	run: ({ caller }) =>
		caller.kind === 'user' ? String(Reflect.get(caller.user, 'name')) : null,
}).with({ access: allow.public })
const remember = defineFunction({
	name: 'remember',
	output: z.boolean(),
	run: ({ client }) => {
		client?.cookies.set('seen', 'yes')
		return true
	},
}).with({ access: allow.public })

let breaking: Error | undefined
/** The caller's tasks ranked above `above`, followed live (D-154). */
const ranked = defineFunction({
	name: 'ranked',
	query: true,
	use: [realtime()],
	input: z.object({ above: z.number() }),
	output: [Task],
	run: async ({ caller, input }) => {
		if (breaking !== undefined) throw breaking
		return Task.findMany(
			{ where: { rank: { gt: input.above } }, orderBy: { rank: 'asc' } },
			{ as: caller },
		)
	},
}).with({ access: allow.public, realtime: { debounce: 10 } })
/** How many tasks the caller has. */
const counted = defineFunction({
	name: 'counted',
	query: true,
	use: [realtime()],
	output: z.number(),
	run: async ({ caller }) => Task.count({}, { as: caller }),
}).with({ access: allow.public, realtime: { debounce: 10 } })

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
/** Each user's name, read again with their caller. */
const names = new Map<string, string>()
let held: Promise<void> | undefined
let brokenLater = false
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
		if (id === 'broken' || brokenLater) throw new Error('Identify broke.')
		if (id === 'refused') throw new PublicError('ACCESS_DENIED', 'Refused.')
		if (id === 'slow') await held
		if (id === null || revoked.has(id)) return undefined
		const user = { id, name: names.get(id) }
		return { kind: 'user', user }
	},
})

interface Maintenance extends PluginTypes {
	readonly name: 'maintenance'
	readonly requires: Http
}
let http: HttpApi | undefined
/** Keeps the HTTP plugin's API, as an application's maintenance would. */
const maintenance = definePlugin<Maintenance>({
	name: 'maintenance',
	manifest: {
		name: 'maintenance',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { http: httpPlugin },
	start: ({ plugins }) => {
		http = plugins.http
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
	names.clear()
	failing = false
	breaking = undefined
	held = undefined
	brokenLater = false
})

type Options = {
	readonly graphql?: GraphqlOptions
	readonly realtime?: RealtimeOptions | false
	readonly models?: readonly (
		typeof Task | typeof Note | typeof Board | typeof Card
	)[]
	readonly upgrade?: Gate
	readonly http?: Pick<HttpOptions, 'proxies' | 'rateLimit'>
	readonly database?: Adapter
}

let schema: GraphQLSchema | undefined
let titles = 0
/** Starts the application; returns its WebSocket URL. */
async function started(options: Options = {}): Promise<string> {
	const plugins = [
		httpPlugin({
			port: 0,
			...options.http,
			...(options.upgrade && { upgrade: options.upgrade }),
		}),
		maintenance.plugin(),
		...(options.realtime === false ? [] : [realtimePlugin(options.realtime)]),
		graphqlPlugin({
			...options.graphql,
			extend: (built) => {
				schema = built
				return options.graphql?.extend?.(built) ?? built
			},
		}),
		sessions.plugin(),
	]
	const app = defineApp({
		database: options.database ?? memory(),
		plugins,
		models: options.models ?? [Task, Note],
		functions:
			options.realtime === false
				? [cookie, remember]
				: [cookie, named, remember, ranked, counted],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	stop = async () => app.stop()
	return `${listening.replace(/^http/, 'ws')}${options.graphql?.path ?? '/graphql'}`
}

/** Whether the application still answers a new client. */
async function answers(url: string): Promise<void> {
	const socket = new WebSocket(url, 'graphql-transport-ws')
	await new Promise((done) => socket.once('open', done))
	const answer = new Promise<RawData>((done) => {
		socket.once('message', done)
	})
	socket.send(JSON.stringify({ type: 'connection_init' }))
	const parts = [await answer].flat().map((part) => new Uint8Array(part))
	expect(Buffer.concat(parts).toString()).toContain('connection_ack')
	socket.close()
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
	it('follows a count alone with no row (D-226)', async () => {
		const reads: Read[] = []
		const database = memory()
		const find = database.find.bind(database)
		database.find = async (read) => {
			reads.push(read)
			return find(read)
		}
		const url = await started({ database })
		await seeded()
		reads.length = 0
		const results = subscribed(url, 'subscription { tasks { totalCount } }')
		expect(await next(results)).toEqual({
			data: { tasks: { totalCount: 3 } },
			extensions: { live: { revision, resume: token } },
		})
		const read = reads.filter((each) => each.model === 'Task')
		// The window reads the sort keys of 2 rows, and no node; a seeded row
		// whose change comes in late is read by its id.
		const windows = read.filter(({ take }) => take !== undefined)
		expect(new Set(windows.map(({ take }) => take))).toStrictEqual(new Set([2]))
		const byId = read.filter(({ take }) => take === undefined)
		expect(
			byId.filter(({ where }) => where?.['id'] === undefined),
		).toStrictEqual([])
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(await next(results)).toEqual({
			extensions: { live: { revision, totalCount: 4 } },
		})
	})

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

	it('moves its cursors as its first and last rows go, holding no rows (D-253)', async () => {
		const url = await started()
		const [a = '', b = '', c = ''] = await seeded()
		const results = subscribed(
			url,
			`subscription { tasks(first: 3, orderBy: [{ rank: asc }]) {
				edges { cursor } pageInfo { startCursor endCursor }
			} }`,
		)
		const first: unknown = await next(results)
		const cursors = JSON.stringify(first).match(/"cursor":"[^"]+"/g) ?? []
		const [, middle = '', end = ''] = cursors.map((at) => at.slice(10, -1))
		expect(first).toMatchObject({
			data: { tasks: { pageInfo: { endCursor: end } } },
		})
		await Task.delete({ where: { id: a } }, M)
		expect(await next(results)).toMatchObject({
			extensions: {
				live: { pageInfo: { startCursor: middle, endCursor: end } },
			},
		})
		await Task.delete({ where: { id: c } }, M)
		expect(await next(results)).toMatchObject({
			extensions: {
				live: { pageInfo: { startCursor: middle, endCursor: middle } },
			},
		})
		await Task.delete({ where: { id: b } }, M)
		expect(await next(results)).toMatchObject({
			extensions: {
				live: { pageInfo: { startCursor: null, endCursor: null } },
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
			query: 'subscription { tasks(first: 4) { edges { cursor } } }',
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

	it('follows more rows than maxTake, at most maxLive', async () => {
		const url = await started()
		await seeded()
		const results = subscribed(
			url,
			'subscription { tasks(first: 4) { edges { node { title } } } }',
		)
		expect(await next(results)).toEqual({
			data: {
				tasks: {
					edges: ['a', 'b', 'c'].map((title) => ({ node: { title } })),
				},
			},
			extensions: { live: { revision, resume: token } },
		})
		await results.return?.()
		const over = subscribed(
			url,
			'subscription { tasks(first: 50001) { edges { cursor } } }',
		)
		expect(await next(over)).toEqual({
			errors: [
				containing({
					message: 'first is over 50000, the most a live list follows.',
					extensions: containing({
						code: 'VALIDATION_FAILED',
						details: containing({ limit: 50_000, rows: 50_001 }),
					}),
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

/** Counts how many times `Task.title` runs, in the generated schema itself. */
function countingTitles(built: GraphQLSchema): GraphQLSchema {
	const field = assertObjectType(built.getType('Task')).getFields()['title']
	if (field) {
		field.resolve = (source: unknown) => {
			titles += 1
			return Reflect.get(Object(source), 'title')
		}
	}
	return built
}

/** A schema that replaces the generated one, a field showing its reader. */
function showingReader(built: GraphQLSchema): GraphQLSchema {
	const extended = extendSchema(
		built,
		parse(`extend type Card { reader: String }`),
	)
	const { reader } = assertObjectType(extended.getType('Card')).getFields()
	if (reader) {
		reader.resolve = (_: unknown, __: unknown, context: GraphqlContext) =>
			idOf(context.caller)
	}
	return extended
}

/** A live list's message that one row changed, as `node`. */
const changed = (node: object) => ({
	extensions: {
		live: { revision, changes: [{ upsert: { node }, after: null }] },
	},
})

describe('subscribers of one row (D-265)', () => {
	const titled = 'subscription { tasks { edges { node { title } } } }'
	it('share its execution, each told', async () => {
		const url = await started({ graphql: { extend: countingTitles } })
		const [id] = await seeded()
		const first = subscribed(url, titled)
		const second = subscribed(url, titled)
		await next(first)
		await next(second)
		titles = 0
		await Task.update({ where: { id: String(id) }, data: { title: 'A' } }, M)
		expect(await next(first)).toEqual(changed({ title: 'A' }))
		expect(await next(second)).toEqual(changed({ title: 'A' }))
		expect(titles).toBe(1)
	})

	it('share it whatever window their arguments chose (D-267)', async () => {
		const url = await started({ graphql: { extend: countingTitles } })
		const [id] = await seeded()
		const query = `subscription ($first: Int) {
			tasks(first: $first, orderBy: [{ rank: asc }]) {
				totalCount edges { node { title } } pageInfo { endCursor }
			}
		}`
		const of = async (first: number) => {
			const results = opening(url).ws.iterate({
				query,
				variables: { first },
			})
			await next(results)
			return results
		}
		const small = await of(1)
		const wide = await of(2)
		titles = 0
		await Task.update({ where: { id: String(id) }, data: { title: 'A' } }, M)
		// Neither window moved, so neither is told of its page info.
		expect(await next(small)).toEqual(changed({ title: 'A' }))
		expect(await next(wide)).toEqual(changed({ title: 'A' }))
		expect(titles).toBe(1)
	})

	it('run apart for a variable that changes what a row shows (D-267)', async () => {
		const url = await started()
		const [id] = await seeded()
		const query = `subscription ($hide: Boolean!) {
			tasks { edges { node { title @skip(if: $hide) rank } } }
		}`
		const of = async (hide: boolean) => {
			const results = opening(url).ws.iterate({
				query,
				variables: { hide },
			})
			await next(results)
			return results
		}
		const shown = await of(false)
		const hidden = await of(true)
		const data = { title: 'A', rank: 5 }
		await Task.update({ where: { id: String(id) }, data }, M)
		expect(await next(shown)).toEqual(changed({ title: 'A', rank: 5 }))
		expect(await next(hidden)).toEqual(changed({ rank: 5 }))
	})

	it('run again for another selection or other variables', async () => {
		const url = await started()
		const [id] = await seeded()
		const plain = subscribed(url, titled)
		const renamed = subscribed(
			url,
			'subscription { tasks { edges { node { name: title } } } }',
		)
		await next(plain)
		await next(renamed)
		await Task.update({ where: { id: String(id) }, data: { title: 'A' } }, M)
		expect(await next(plain)).toEqual(changed({ title: 'A' }))
		expect(await next(renamed)).toEqual(changed({ name: 'A' }))
	})

	it('run apart once `extend` changed the schema', async () => {
		const url = await started({
			graphql: { extend: showingReader },
			models: [Task, Note, Board, Card],
		})
		const board = await Board.create({ data: {} }, M)
		const query = 'subscription { cards { edges { node { reader } } } }'
		const ada = subscribed(url, query)
		const bob = subscribed(url, query, undefined, 'bob')
		await next(ada)
		await next(bob)
		await Card.create({ data: { board: { connect: { id: board.id } } } }, M)
		expect(await next(ada)).toMatchObject(changed({ reader: 'ada' }))
		expect(await next(bob)).toMatchObject(changed({ reader: 'bob' }))
	})

	it('of a live function run apart, its value being anything', async () => {
		const url = await started({ graphql: { extend: countingTitles } })
		await seeded()
		const query = 'subscription { ranked(above: 1) { title } }'
		const first = subscribed(url, query)
		const second = subscribed(url, query)
		await next(first)
		await next(second)
		titles = 0
		await Task.updateMany({ where: { title: 'b' }, data: { title: 'B' } }, M)
		const value = { data: { ranked: [{ title: 'B' }, { title: 'c' }] } }
		expect(await next(first)).toMatchObject(value)
		expect(await next(second)).toMatchObject(value)
		expect(titles).toBe(4)
	})
})

describe('a live function', () => {
	const query = 'subscription { ranked(above: 1) { title } }'

	it('sends its result, then again when what it read changes', async () => {
		const url = await started()
		await seeded()
		const results = subscribed(url, query)
		expect(await next(results)).toEqual({
			data: { ranked: [{ title: 'b' }, { title: 'c' }] },
			extensions: { live: { revision: 1 } },
		})
		await Task.updateMany({ where: { title: 'b' }, data: { title: 'B' } }, M)
		expect(await next(results)).toEqual({
			data: { ranked: [{ title: 'B' }, { title: 'c' }] },
			extensions: { live: { revision: 2 } },
		})
		const count = subscribed(url, 'subscription { counted }')
		expect(await next(count)).toMatchObject({ data: { counted: 3 } })
		await Task.create({ data: { title: 'd', rank: 4, owner: 'ada' } }, M)
		expect(await next(count)).toMatchObject({ data: { counted: 4 } })
	})

	it('counts its rows in maxRows, as its query over HTTP (D-229)', async () => {
		const url = await started({ graphql: { maxRows: 5 } })
		await seeded()
		expect(await next(subscribed(url, query))).toEqual({
			errors: [
				containing({
					message:
						'The document asks for more than 5 rows. Ask for fewer with first or last.',
					extensions: { code: 'BAD_USER_INPUT' },
				}),
			],
		})
		const results = opening(url, undefined, {
			'x-ultimabase-master-key': 'secret',
		}).ws.iterate({ query })
		expect(await next(results)).toMatchObject({
			data: { ranked: [{ title: 'b' }, { title: 'c' }] },
		})
		await results.return?.()
	})

	it('sends the public error it fails with, then completes', async () => {
		const url = await started()
		await seeded()
		const results = subscribed(url, query)
		await next(results)
		breaking = new PublicError('NOT_FOUND', 'No such board.')
		await Task.updateMany({ where: { title: 'b' }, data: { title: 'B' } }, M)
		expect(await next(results)).toEqual({
			errors: [
				containing({
					message: 'No such board.',
					extensions: { code: 'NOT_FOUND' },
				}),
			],
		})
		expect((await results.next()).done).toBe(true)
	})

	it('masks any other error, which it logs', async () => {
		const url = await started()
		await seeded()
		const results = subscribed(url, query)
		await next(results)
		breaking = new Error('Secret.')
		await Task.updateMany({ where: { title: 'b' }, data: { title: 'B' } }, M)
		expect(await next(results)).toEqual({
			errors: [
				containing({
					message: 'Internal error.',
					extensions: { code: 'INTERNAL', correlationId: token },
				}),
			],
		})
		expect(errors).toEqual(['A GraphQL field failed.'])
	})

	it('is refused when its first run fails', async () => {
		const url = await started()
		breaking = new PublicError('NOT_FOUND', 'No such board.')
		expect(await next(subscribed(url, query))).toEqual({
			errors: [
				containing({
					message: 'No such board.',
					extensions: containing({ code: 'NOT_FOUND' }),
				}),
			],
		})
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

	it('grows past maxTake, which bounds page mode only', async () => {
		const url = await started()
		await seeded()
		const { ws } = opening(url)
		const kept = await completed(ws)
		const results = ws.iterate({
			query: growing,
			variables: { first: 4 },
			extensions: { live: { resume: kept } },
		})
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision: 2,
					changes: [{ upsert: { node: { title: 'c' } }, after: anything }],
					pageInfo: { hasNextPage: false },
				},
			},
		})
		await results.return?.()
	})

	it('stops at its limit, says so, and stays live', async () => {
		const url = await started({ realtime: { maxLive: 2 } })
		const [a = ''] = await seeded()
		const { ws } = opening(url)
		const kept = await completed(ws)
		const results = ws.iterate({
			query: growing,
			variables: { first: 3 },
			extensions: { live: { resume: kept } },
		})
		expect(await next(results)).toEqual({
			extensions: { live: { revision: 2, changes: [] } },
		})
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision: 3,
					changes: [{ upsert: { node: { title: 'A' } }, after: null }],
				},
			},
		})
		await results.return?.()
	})

	it('opens at its limit when the list it grew is gone', async () => {
		const url = await started({ realtime: { maxLive: 2 } })
		await seeded()
		const { ws } = opening(url)
		const results = ws.iterate({
			query: growing,
			variables: { first: 3 },
			extensions: { live: { resume: 'gone' } },
		})
		expect(await next(results)).toEqual({
			data: {
				tasks: {
					edges: ['a', 'b'].map((title) => ({ node: { title } })),
					pageInfo: { hasNextPage: false },
				},
			},
			extensions: { live: { revision, resume: token } },
		})
		await results.return?.()
	})

	it('is refused past its connection, with it, and kept as it was', async () => {
		const url = await started({ realtime: { maxConnectionRows: 2 } })
		const [a = ''] = await seeded()
		const { ws } = opening(url)
		const kept = await completed(ws)
		const refused = ws.iterate({
			query: growing,
			variables: { first: 3 },
			extensions: { live: { resume: kept } },
		})
		expect(await next(refused)).toEqual({
			errors: [
				containing({
					message: 'A connection follows at most 2 rows.',
					extensions: containing({ code: 'VALIDATION_FAILED' }),
				}),
			],
		})
		const results = ws.iterate({
			query: growing,
			variables: { first: 2 },
			extensions: { live: { resume: kept } },
		})
		await Task.update({ where: { id: a }, data: { title: 'A' } }, M)
		expect(await next(results)).toEqual({
			extensions: {
				live: {
					revision: 2,
					changes: [{ upsert: { node: { title: 'A' } }, after: null }],
				},
			},
		})
		await results.return?.()
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

	it('counts its values, not the rows maxLive bounds (D-349)', async () => {
		const url = await started({
			graphql: { maxRows: 10 },
			models: [Task, Note, Board, Card],
		})
		const { id } = await Board.create({ data: {} }, M)
		// 100 cards: 2 values, then 3 for each card, past 10 rows.
		const most = `subscription { board(where: { id: "${id}" }) { cards { edges { node { id } } } } }`
		expect(await next(subscribed(url, most))).toMatchObject({
			data: { board: { cards: { edges: [] } } },
		})
		const more = most.replace('node { id }', 'node { id a: id b: id }')
		expect(await next(subscribed(url, more))).toEqual({
			errors: [
				containing({
					message:
						'The document returns more than 500 values. Select fewer fields, aliases or rows.',
					extensions: { code: 'BAD_USER_INPUT' },
				}),
			],
		})
	})
})

describe('the subscriptions', () => {
	it('are the live models’ and functions’ only', async () => {
		await started()
		const fields = schema?.getSubscriptionType()?.getFields() ?? {}
		expect(Object.keys(fields)).toEqual(['task', 'tasks', 'ranked', 'counted'])
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

	it('refuse variables nested too deep, as a query (D-228)', async () => {
		const url = await started()
		const socket = new WebSocket(url, 'graphql-transport-ws')
		const frames: unknown[] = []
		const answered = new Promise((done) => {
			socket.on('message', (data: RawData) => {
				const parts = [data].flat().map((part) => new Uint8Array(part))
				frames.push(JSON.parse(Buffer.concat(parts).toString()))
				if (frames.length === 2) done(undefined)
			})
		})
		await new Promise((done) => socket.once('open', done))
		socket.send(JSON.stringify({ type: 'connection_init' }))
		// As text: JSON.stringify runs out of stack.
		const where = `${'{"NOT":'.repeat(19_999)}{"title":{"equals":"a"}}${'}'.repeat(19_999)}`
		const query = `subscription ($where: TaskWhereInput) { tasks(where: $where) { totalCount } }`
		socket.send(
			`{"id":"1","type":"subscribe","payload":{"query":${JSON.stringify(query)},"variables":{"where":${where}}}}`,
		)
		await answered
		socket.close()
		expect(frames[1]).toEqual({
			id: '1',
			type: 'next',
			payload: {
				errors: [
					{
						message: 'The variables are nested too deep.',
						extensions: { code: 'BAD_USER_INPUT' },
					},
				],
			},
		})
		expect(errors).toEqual([])
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

	it('do not count a live list in maxRows, which maxLive bounds (D-229)', async () => {
		const url = await started({
			graphql: { maxRows: 1 },
			models: [Task, Board, Card],
		})
		const board = await Board.create({ data: {} }, M)
		await Card.create({ data: { board: { connect: { id: board.id } } } }, M)
		const results = subscribed(
			url,
			`subscription { boards(first: 2) { edges { node {
				cards(first: 2) { edges { node { id } } }
			} } } }`,
		)
		expect(await next(results)).toMatchObject({
			data: { boards: { edges: [{ node: { cards: { edges: [anything] } } }] } },
		})
		await results.return?.()
	})

	it('refuse a live list returning more than 50 values a row it reads (D-349)', async () => {
		const url = await started({ models: [Task, Board, Card] })
		expect(await next(subscribed(url, listed(70)))).toMatchObject({
			data: { boards: { edges: [] } },
		})
		expect(await next(subscribed(url, listed(71)))).toEqual(wideRefusal)
	})

	it('never count a live list past maxRows values (D-349)', async () => {
		const url = await started({
			graphql: { maxRows: 1 },
			models: [Task, Board, Card],
		})
		// 50 values for maxRows 1, however many rows the list reads.
		expect(await next(subscribed(url, listed(20)))).toMatchObject({
			data: { boards: { edges: [] } },
		})
		expect(await next(subscribed(url, listed(21)))).toEqual(wideRefusal)
		// 1,500,000 ids: counting them all took more than a second.
		const fanned = `subscription { boards(first: 1) { ...E } }
			fragment E on BoardConnection { ${aliases(100, 'edges { ...N }')} }
			fragment N on BoardEdge { ${aliases(100, 'node { ...T }')} }
			fragment T on Board { ${aliases(150)} }`
		const begin = performance.now()
		expect(await next(subscribed(url, fanned))).toEqual(wideRefusal)
		expect(performance.now() - begin).toBeLessThan(1000)
	})

	it('count each operation as a request of the address (D-230)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		try {
			const url = await started({
				http: { proxies: 1, rateLimit: { requests: 3, window: 60_000 } },
			})
			const { ws, closes } = opening(url, 'ada', {
				'x-forwarded-for': '203.0.113.5',
			})
			// The upgrade and two operations, then the third is over the limit.
			for (let sent = 0; sent < 2; sent += 1) {
				expect(await next(ws.iterate({ query: '{ named }' }))).toEqual({
					data: { named: 'undefined' },
				})
			}
			expect(await failed(ws.iterate({ query: '{ named }' }))).toEqual([
				containing({
					message: 'Too many requests: try again later.',
					extensions: {
						code: 'TOO_MANY_ATTEMPTS',
						details: { retryAfter: 60 },
					},
				}),
			])
			vi.setSystemTime(Date.now() + 60_000)
			expect(await next(ws.iterate({ query: '{ named }' }))).toEqual({
				data: { named: 'undefined' },
			})
			expect(closes).toEqual([])
			const asMaster = opening(url, undefined, {
				'x-forwarded-for': '203.0.113.5',
				'x-ultimabase-master-key': 'secret',
			}).ws
			for (let sent = 0; sent < 4; sent += 1) {
				expect(await next(asMaster.iterate({ query: '{ named }' }))).toEqual({
					data: { named: null },
				})
			}
		} finally {
			vi.useRealTimers()
		}
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
			errors: [
				containing({
					message: 'A WebSocket cannot set a cookie.',
					extensions: { code: 'BAD_REQUEST' },
				}),
			],
		})
		expect(errors).toEqual([])
		expect(failures).toEqual([])
	})

	it('runs each query and mutation as its caller read again', async () => {
		const url = await started()
		names.set('ada', 'Ada')
		const { ws } = opening(url)
		expect(await next(ws.iterate({ query: '{ named }' }))).toEqual({
			data: { named: 'Ada' },
		})
		names.set('ada', 'Ada Lovelace')
		expect(await next(ws.iterate({ query: '{ named }' }))).toEqual({
			data: { named: 'Ada Lovelace' },
		})
	})

	it('closes 4403 when a query’s caller is no longer the same user', async () => {
		const url = await started()
		const { ws, closes } = opening(url)
		expect(await next(ws.iterate({ query: '{ cookie }' }))).toEqual({
			data: { cookie: null },
		})
		revoked.add('ada')
		await failed(ws.iterate({ query: '{ cookie }' }))
		expect(closes).toEqual([{ code: 4403, reason: 'Forbidden' }])
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
				extensions: { code: 'BAD_USER_INPUT' },
			}),
		])
		expect(
			await failed(ws.iterate({ query: 'subscription { nope }' })),
		).toEqual([
			containing({
				message: 'Cannot query field "nope" on type "Subscription".',
				extensions: { code: 'BAD_USER_INPUT' },
			}),
		])
	})

	it('tries again later when its caller could not be read (D-278)', async () => {
		const url = await started()
		const { ws, closes } = opening(url, 'broken')
		await failed(ws.iterate({ query: tasks }))
		expect(closes).toEqual([{ code: 1013, reason: 'Try again later' }])
		expect(errors).toEqual(['A WebSocket caller was not read.'])
	})

	it('is refused when identify refuses it publicly', async () => {
		const url = await started()
		const { ws, closes } = opening(url, 'refused')
		await failed(ws.iterate({ query: tasks }))
		expect(closes).toEqual([{ code: 4403, reason: 'Forbidden' }])
		expect(errors).toEqual([])
	})

	it('tries again later when a query’s caller could not be read (D-278)', async () => {
		const url = await started()
		const { ws, closes } = opening(url)
		await next(ws.iterate({ query: '{ cookie }' }))
		brokenLater = true
		await failed(ws.iterate({ query: '{ cookie }' }))
		expect(closes).toEqual([{ code: 1013, reason: 'Try again later' }])
	})

	it('tries again later when a rebuild could not read its caller (D-278)', async () => {
		const url = await started({ realtime: { refresh: 20 } })
		await seeded()
		const { ws, closes } = opening(url)
		const results = ws.iterate({ query: tasks })
		await next(results)
		brokenLater = true
		await failed(results)
		expect(closes).toEqual([{ code: 1013, reason: 'Try again later' }])
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

	it('compresses only what is worth it, each message alone (D-266)', async () => {
		const { hostname, pathname, port } = new URL(await started())
		const socket = createConnection(Number(port), hostname)
		let received = Buffer.alloc(0)
		socket.on('data', (chunk) => {
			received = Buffer.concat([received, chunk])
		})
		socket.write(
			[
				`GET ${pathname} HTTP/1.1`,
				`Host: ${hostname}:${port}`,
				'Upgrade: websocket',
				'Connection: Upgrade',
				'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
				'Sec-WebSocket-Version: 13',
				'Sec-WebSocket-Protocol: graphql-transport-ws',
				'Sec-WebSocket-Extensions: permessage-deflate',
				'\r\n',
			].join('\r\n'),
		)
		// A client's frame, its mask of zeros leaving the text as it is.
		const send = (message: object) => {
			const text = JSON.stringify(message).padEnd(200)
			const size = [text.length >> 8, text.length & 0xff]
			const head = [0x81, 0x80 | 126, ...size, 0, 0, 0, 0]
			socket.write(Buffer.concat([Buffer.from(head), Buffer.from(text)]))
		}
		/** Whether each frame the server sent is compressed. */
		const compressed = () => {
			const frames: boolean[] = []
			let at = received.indexOf('\r\n\r\n') + 4
			while (at < received.length) {
				const size = received.readUInt8(at + 1)
				frames.push((received.readUInt8(at) & 0x40) !== 0)
				at += size === 126 ? 4 + received.readUInt16BE(at + 2) : 2 + size
			}
			return frames
		}
		await vi.waitFor(() => {
			expect(received.toString()).toContain('\r\n\r\n')
		})
		const answer = received.toString().toLowerCase()
		expect(answer).toContain('server_no_context_takeover')
		expect(answer).toContain('client_no_context_takeover')
		send({ type: 'ping' })
		await vi.waitFor(() => {
			expect(compressed()).toEqual([false])
		})
		// A row's change, sent to all who follow it, stays as it is (D-273).
		send({ type: 'ping', payload: { big: 'x'.repeat(1900) } })
		await vi.waitFor(() => {
			expect(compressed()).toEqual([false, false])
		})
		send({ type: 'ping', payload: { big: 'x'.repeat(2100) } })
		await vi.waitFor(() => {
			expect(compressed()).toEqual([false, false, true])
		})
		socket.destroy()
	})

	// One client's bad frame closes its socket, and nothing else (D-290): with no
	// listener, the `error` of `ws` would be uncaught, and stop the whole server.
	describe('sent a bad frame', () => {
		it.each([
			['reserved bits', [0xff, 0x00], 1002],
			['no mask', [0x81, 0x01, 0x61], 1002],
			['text that is no UTF-8', [0x81, 0x82, 0, 0, 0, 0, 0xff, 0xff], 1007],
			// Refused on its size alone, before any of it arrives.
			['2 MB announced', [0x82, 0xff, 0, 0, 0, 0, 0, 0x20, 0, 0], 1009],
		])('of %s, closes only that socket', async (_name, frame, code) => {
			const url = await started()
			const { hostname, pathname, port } = new URL(url)
			const socket = createConnection(Number(port), hostname)
			let received = Buffer.alloc(0)
			socket.on('data', (chunk) => {
				received = Buffer.concat([received, chunk])
			})
			socket.write(
				[
					`GET ${pathname} HTTP/1.1`,
					`Host: ${hostname}:${port}`,
					'Upgrade: websocket',
					'Connection: Upgrade',
					'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
					'Sec-WebSocket-Version: 13',
					'Sec-WebSocket-Protocol: graphql-transport-ws',
					'\r\n',
				].join('\r\n'),
			)
			await vi.waitFor(() => {
				expect(received.toString()).toContain('\r\n\r\n')
			})
			const answered = received.length
			socket.write(Buffer.from(frame))
			await new Promise((done) => socket.once('close', done))
			// A close frame: its header, and then the code.
			expect(received.readUInt8(answered)).toBe(0x88)
			expect(received.readUInt16BE(answered + 2)).toBe(code)
			await answers(url)
			expect(errors).toEqual([])
		})

		it.each([
			['as it is', false],
			['compressed', true],
		])('too big, %s, closes only that socket', async (_name, compressed) => {
			const url = await started()
			const socket = new WebSocket(url, 'graphql-transport-ws', {
				perMessageDeflate: compressed,
			})
			await new Promise((done) => socket.once('open', done))
			const closed = new Promise<number>((done) => {
				socket.once('close', done)
			})
			socket.send(Buffer.alloc(2 * 1024 * 1024, 0x61))
			expect(await closed).toBe(1009)
			await answers(url)
			expect(errors).toEqual([])
		})
	})

	it('closes on an id used twice, however long the id', async () => {
		const socket = new WebSocket(await started(), 'graphql-transport-ws')
		await new Promise((done) => socket.once('open', done))
		const closed = new Promise<number>((done) => {
			socket.once('close', done)
		})
		const acknowledged = new Promise((done) => socket.once('message', done))
		socket.send(JSON.stringify({ type: 'connection_init' }))
		await acknowledged
		const twice = JSON.stringify({
			id: 'x'.repeat(200),
			type: 'subscribe',
			payload: { query: 'subscription { tasks { edges { node { id } } } }' },
		})
		socket.send(twice)
		socket.send(twice)
		expect(await closed).toBe(4409)
		expect(errors).toEqual([])
	})

	it('keeps a small compressor, and a big message crosses it whole (D-269)', async () => {
		const socket = new WebSocket(await started(), 'graphql-transport-ws')
		let negotiated: unknown
		socket.once('upgrade', ({ headers }) => {
			negotiated = headers['sec-websocket-extensions']
		})
		await new Promise((done) => socket.once('open', done))
		expect(negotiated).toContain('server_max_window_bits=12')
		// Larger than the window, what it repeats further back than it reaches.
		const big = Array.from({ length: 40_000 }, (_, at) => at % 97).join()
		const answer = new Promise<RawData>((done) => {
			socket.once('message', done)
		})
		socket.send(JSON.stringify({ type: 'ping', payload: { big } }))
		const answered = [await answer].flat().map((part) => new Uint8Array(part))
		expect(JSON.parse(Buffer.concat(answered).toString())).toEqual({
			type: 'pong',
			payload: { big },
		})
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
			// The client answers the ping as it reads it: once it has, its pong is
			// on the wire before the next message, and the server reads it first.
			const pinged = new Promise((done) => answering.once('ping', done))
			vi.advanceTimersByTime(12_000)
			await pinged
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

	it('is closed with the code the application asks, then refused', async () => {
		let down = false
		const url = await started({
			upgrade: () =>
				down
					? Response.json(
							{ code: 'UNAVAILABLE', message: 'Under maintenance.' },
							{ status: 503 },
						)
					: undefined,
		})
		const { ws, closes } = opening(url)
		const results = ws.iterate({ query: tasks })
		await next(results)
		down = true
		http?.closeUpgrades({ code: 1012, reason: 'Maintenance' })
		await failed(results)
		expect(closes).toEqual([{ code: 1012, reason: 'Maintenance' }])
		const refused = new WebSocket(url, 'graphql-transport-ws')
		const status = await new Promise((done) => {
			refused.once('unexpected-response', (_request, response) => {
				// The server closes the socket once it answered.
				response.resume()
				done(response.statusCode)
			})
		})
		expect(status).toBe(503)
	})
})

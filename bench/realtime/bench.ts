// The realtime benchmark (D-154): what a write costs the engine once
// subscribers follow it, on PostgreSQL. For each case, subscribers on one
// list or on a list each, it counts the statements a write adds, the time
// from the write's return to each message, and the memory each connection
// and each subscription holds; then the commit rate with and without the
// feed. `node --expose-gc bench/realtime/bench.ts --help`.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import type { LiveMessage, Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { Caller, PluginTypes } from 'ultimabase'
import { defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { createAdapter } from '../../packages/postgres/src/adapter.ts'
import { asUser } from '../../packages/testing/src/as-user.ts'
import { silent } from '../../packages/testing/src/silent.ts'

const usage = `node --expose-gc --max-old-space-size=16384 bench/realtime/bench.ts
  [--subscribers 1000,10000] [--windows 25,1000] [--writes 20] [--url <url>]

  --subscribers  how many follow, each on a connection of its own
  --windows      the rows each list shows
  --writes       timed writes of each kind (update, insert, delete) a case
  --url          the PostgreSQL server; the benchmark works in a schema of
                 its own and drops it (BENCH_DATABASE_URL, else localhost:54318)`

const M = { as: master }
const idOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

/** A user reads the shared items and their own. */
const Item = defineModel({
	name: 'Item',
	use: [realtime()],
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true }),
		owner: f.string(),
	}),
	// A list each reads its owner's rows in rank order.
	indexes: [{ fields: ['owner', 'rank'] }],
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ owner: { in: [idOf(caller), 'all'] } }),
	},
})

/** Item's twin, which no live read follows: the commit rate without the feed. */
const Entry = defineModel({
	name: 'Entry',
	fields: (f) => ({ title: f.string() }),
})

let api: RealtimeApi | undefined
interface Bench extends PluginTypes {
	readonly name: 'bench'
	readonly requires: Realtime
}
/** Keeps the realtime API; a request's `authorization` is its user's id. */
const benchPlugin = definePlugin<Bench>({
	name: 'bench',
	manifest: {
		name: 'bench',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

type Shape = 'one list' | 'a list each'
type Case = {
	readonly shape: Shape
	readonly subscribers: number
	readonly window: number
}
type Kind = 'update' | 'insert' | 'delete'
type Stats = { statements: number[]; latencies: number[]; last: number[] }
type Result = {
	readonly kinds: ReadonlyMap<Kind, Stats>
	readonly connection: number
	readonly subscription: number
	readonly subscribe: number
}

/** The value at `share` of the sorted `values`. */
const at = (values: readonly number[], share: number): number => {
	const sorted = values.toSorted((a, b) => a - b)
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
	)
}
const waited = async (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
const heap = async (): Promise<number> => {
	for (let index = 0; index < 3; index += 1) {
		globalThis.gc?.()
		await waited(50)
	}
	return process.memoryUsage().heapUsed
}

async function query(url: string, statement: string): Promise<unknown[]> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		const result: { rows: unknown[] } = await client.query(statement)
		return result.rows
	} finally {
		await client.end()
	}
}

/** Runs `task` on each of `count` indexes, `limit` at a time. */
async function bounded(
	count: number,
	limit: number,
	task: (index: number) => Promise<void>,
): Promise<void> {
	let next = 0
	const worker = async (): Promise<void> => {
		while (next < count) {
			const index = next
			next += 1
			await task(index)
		}
	}
	await Promise.all(Array.from({ length: limit }, worker))
}

/** The rows of `owner`, ranked 1 to `count`. */
async function seed(owner: string, count: number): Promise<void> {
	for (let from = 0; from < count; from += 5000) {
		const data = Array.from(
			{ length: Math.min(5000, count - from) },
			(_, i) => ({
				title: `t${from + i + 1}`,
				rank: from + i + 1,
				owner,
			}),
		)
		await Item.createMany({ data }, M)
	}
}

/** One case on a fresh schema: subscribe, then time each kind of write. */
async function run(url: string, each: Case, writes: number): Promise<Result> {
	const schema = `bench_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	let statements = 0
	const separator = url.includes('?') ? '&' : '?'
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const database = createAdapter({
		url: `${url}${separator}options=${options}`,
		log: () => {
			statements += 1
		},
	})
	const plugins = [realtimePlugin(), benchPlugin.plugin()]
	const app = defineApp({ database, models: [Item], plugins, logger: silent })
	await app.start()
	try {
		const { shape, subscribers, window } = each
		const one = shape === 'one list'
		const users = Array.from({ length: subscribers }, (_, i) => `u${i}`)
		// A deleted row lets the next one in: each list has rows past its window.
		const rows = window + 10
		if (one) await seed('all', rows)
		else await bounded(users.length, 8, async (i) => seed(users[i] ?? '', rows))
		await waited(200)
		const realtimeApi = api
		if (realtimeApi === undefined) throw new Error('No realtime API.')
		let t0 = 0
		let arrived = 0
		const latencies: number[] = []
		const send = (message: LiveMessage) => {
			if (t0 === 0 || message.kind !== 'changes') return
			arrived += 1
			latencies.push(performance.now() - t0)
		}
		const before = await heap()
		const viewers = await Promise.all(
			users.map(async (id) =>
				realtimeApi.connect(
					new Request('http://localhost/', { headers: { authorization: id } }),
				),
			),
		)
		const connected = await heap()
		const started = performance.now()
		await bounded(viewers.length, 16, async (i) => {
			const where = { owner: one ? 'all' : users[i] }
			const args = {
				where,
				orderBy: [{ rank: 'asc' }],
				first: window,
				select: { title: true, rank: true },
			}
			await viewers[i]?.list('Item', args, send)
		})
		const subscribe = performance.now() - started
		const subscribed = await heap()
		const kinds = new Map<Kind, Stats>()
		const expected = one ? subscribers : 1
		for (let index = -2; index < writes; index += 1) {
			const owner = one ? 'all' : (users[Math.abs(index) % users.length] ?? '')
			const middle = await Item.findFirst(
				{ where: { owner, rank: Math.ceil(window / 2) } },
				M,
			)
			let inserted = ''
			const steps: [Kind, () => Promise<unknown>][] = [
				[
					'update',
					async () =>
						Item.update(
							{
								where: { id: middle?.id ?? '' },
								data: { title: randomUUID() },
							},
							M,
						),
				],
				[
					'insert',
					async () => {
						const row = await Item.create(
							{ data: { title: 'new', rank: 0, owner } },
							M,
						)
						inserted = row.id
					},
				],
				['delete', async () => Item.delete({ where: { id: inserted } }, M)],
			]
			for (const [kind, write] of steps) {
				arrived = 0
				latencies.length = 0
				await write()
				t0 = performance.now()
				const written = statements
				const deadline = t0 + 60_000
				const all = () => arrived >= expected
				while (!all() && performance.now() < deadline) await waited(1)
				if (arrived < expected) {
					throw new Error(`${kind}: ${arrived} of ${expected} messages.`)
				}
				const last = performance.now() - t0
				t0 = 0
				// The engine goes on with the viewers the write did not reach.
				let quiet = statements
				do {
					quiet = statements
					await waited(150)
				} while (statements !== quiet)
				if (index < 0) continue
				const stats = kinds.get(kind) ?? {
					statements: [],
					latencies: [],
					last: [],
				}
				kinds.set(kind, stats)
				stats.statements.push(statements - written)
				stats.latencies.push(...latencies)
				stats.last.push(last)
			}
		}
		return {
			kinds,
			connection: (connected - before) / subscribers,
			subscription: (subscribed - connected) / subscribers,
			subscribe,
		}
	} finally {
		await app.stop()
		await query(url, `drop schema "${schema}" cascade`)
	}
}

/** Updates a second, `writers` at a time, with the feed or without. */
async function commitRate(url: string, feed: boolean): Promise<number> {
	const schema = `bench_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	const separator = url.includes('?') ? '&' : '?'
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const database = createAdapter({
		url: `${url}${separator}options=${options}`,
	})
	const plugins = feed ? [realtimePlugin(), benchPlugin.plugin()] : []
	const models = feed ? [Item] : [Entry]
	const app = defineApp({ database, models, plugins, logger: silent })
	await app.start()
	try {
		const data = Array.from({ length: 100 }, (_, i) => ({
			title: `t${i}`,
			rank: i,
			owner: 'all',
		}))
		const ids = feed
			? (await Item.createManyAndReturn({ data }, M)).map(({ id }) => id)
			: (
					await Entry.createManyAndReturn(
						{ data: data.map(({ title }) => ({ title })) },
						M,
					)
				).map(({ id }) => id)
		const update = async (id: string, title: string) =>
			feed
				? Item.update({ where: { id }, data: { title } }, M)
				: Entry.update({ where: { id }, data: { title } }, M)
		const count = 5000
		const started = performance.now()
		await bounded(count, 16, async (i) => {
			await update(ids[i % ids.length] ?? '', `t${i}`)
		})
		return count / ((performance.now() - started) / 1000)
	} finally {
		await app.stop()
		await query(url, `drop schema "${schema}" cascade`)
	}
}

const { values } = parseArgs({
	options: {
		subscribers: { type: 'string', default: '1000,10000' },
		windows: { type: 'string', default: '25,1000' },
		writes: { type: 'string', default: '20' },
		url: {
			type: 'string',
			default:
				process.env['BENCH_DATABASE_URL'] ??
				'postgres://postgres:postgres@localhost:54318/postgres',
		},
		help: { type: 'boolean', default: false },
	},
})
const numbers = (list: string): number[] => list.split(',').map(Number)
const writes = Number(values.writes)
if (values.help || globalThis.gc === undefined) {
	console.log(usage)
	process.exit(values.help ? 0 : 1)
}

const ms = (value: number): string => value.toFixed(1)
const kb = (bytes: number): string => (bytes / 1024).toFixed(1)
console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${writes} writes of each kind a case; times in ms, memory in KiB.\n`,
)
console.log(
	'| Subscribers | Lists | Window | Write | Statements | p50 | p99 | Last message p50 | Connection | Subscription | Subscribe all |',
)
console.log(
	'| --: | --- | --: | --- | --: | --: | --: | --: | --: | --: | --: |',
)
for (const subscribers of numbers(values.subscribers)) {
	for (const shape of ['one list', 'a list each'] as const) {
		for (const window of numbers(values.windows)) {
			const result = await run(
				values.url,
				{ shape, subscribers, window },
				writes,
			)
			for (const [kind, stats] of result.kinds) {
				const queries = `${Math.min(...stats.statements)}–${Math.max(...stats.statements)}`
				console.log(
					`| ${subscribers} | ${shape} | ${window} | ${kind} | ${queries} | ${ms(at(stats.latencies, 0.5))} | ${ms(at(stats.latencies, 0.99))} | ${ms(at(stats.last, 0.5))} | ${kb(result.connection)} | ${kb(result.subscription)} | ${ms(result.subscribe)} |`,
				)
			}
		}
	}
}
const without = await commitRate(values.url, false)
const withFeed = await commitRate(values.url, true)
console.log(
	`\nCommit rate, 16 writers: ${without.toFixed(0)} updates/s without the feed, ${withFeed.toFixed(0)} with it.`,
)

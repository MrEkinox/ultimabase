// The HTTP benchmark: what a whole request costs a server process, from the
// socket to the socket, over REST and GraphQL, signed in and under read rules.
// `node bench/http/bench.ts --help`.
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { Session } from 'node:inspector/promises'
import { parseArgs } from 'node:util'
import { authPlugin, defineUser, isOwner, currentUser } from '@ultimabase/auth'
import { graphql, graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { password, passwordPlugin } from '@ultimabase/password'
import { rest, restPlugin } from '@ultimabase/rest'
import { Client, Pool } from 'pg'
import { defineApp, defineModel, master } from 'ultimabase'
import { postgres } from '../../packages/postgres/src/index.ts'
import { silent } from '../../packages/testing/src/silent.ts'
import { casesOf } from './cases.ts'
import type { Asked, Measured, Sent } from './load.ts'
import { isMeasured } from './load.ts'

const usage = `node bench/http/bench.ts [--seconds 6] [--concurrency 16] [--cases <substring>] [--profile <file>] [--url <postgres url>]

  --seconds      timed seconds of each case, after 2 untimed, 10 for the first
  --concurrency  clients, each with a connection of its own
  --cases        only the cases whose name holds this text
  --profile      a file for the CPU profile of the timed seconds, for one case
  --url          the PostgreSQL server; the benchmark works in a schema of its
                 own and drops it (BENCH_DATABASE_URL, else localhost:54318)`

const M = { as: master }
const port = 34_517
const coldStart = 10

declare module 'ultimabase' {
	interface Register {
		readonly user: typeof User
	}
}

const User = defineUser({
	name: 'User',
	use: [rest(), graphql(), password()],
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post, { inverse: 'author' }),
	}),
}).with({ access: { read: () => true } })

const Post = defineModel({
	name: 'Post',
	use: [rest(), graphql()],
	fields: (f) => ({
		title: f.string(),
		likes: f.number({ integer: true, default: 0 }),
		published: f.boolean({ default: true }),
		author: f.one(() => User, { default: currentUser }),
		comments: f.many(() => Comment, { inverse: 'post' }),
	}),
}).with({
	access: {
		read: ({ where }) =>
			where({
				OR: [{ published: { equals: true } }, { author: { viewer: true } }],
			}),
		create: isOwner('author'),
		update: isOwner('author'),
	},
})

const Comment = defineModel({
	name: 'Comment',
	use: [rest(), graphql()],
	fields: (f) => ({
		text: f.string(),
		post: f.one(() => Post),
	}),
}).with({ access: { read: () => true } })

const at = (sorted: readonly number[], share: number): number =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0

type Row = {
	readonly name: string
	readonly perSecond: number
	readonly p50: number
	readonly p99: number
	/** The server's CPU a request, in µs. */
	readonly cpu: number
	readonly failed: number
}

/** Starts the CPU profile `--profile` asks for, of the timed seconds only. */
async function profiling(): Promise<() => Promise<void>> {
	const file = values.profile
	if (file === undefined) return async () => undefined
	const session = new Session()
	session.connect()
	await session.post('Profiler.enable')
	await session.post('Profiler.setSamplingInterval', { interval: 200 })
	await session.post('Profiler.start')
	return async () => {
		const { profile } = await session.post('Profiler.stop')
		writeFileSync(file, JSON.stringify(profile))
		session.disconnect()
	}
}

/** Loads the server with `sent`, from a process of its own. */
async function loaded(
	name: string,
	sent: readonly Sent[],
	concurrency: number,
	seconds: number,
	warm = 2,
): Promise<Row> {
	const child = fork(new URL('load.ts', import.meta.url), { execArgv: [] })
	const asked: Asked = { port, sent, concurrency, warm, seconds }
	const finished = new Promise<Measured>((done, fail) => {
		child.once('message', (message) => {
			if (isMeasured(message)) done(message)
			else fail(new TypeError('Not what clients measure.'))
		})
		child.once('error', fail)
	})
	child.send(asked)
	// Its CPU counts from the end of the warm-up.
	await new Promise((resolve) => setTimeout(resolve, warm * 1000))
	const before = process.cpuUsage()
	const stop = await profiling()
	const measured = await finished
	await stop()
	const used = process.cpuUsage(before)
	const times = measured.times.toSorted((a, b) => a - b)
	if (measured.failed > 0) {
		console.error(
			`${name}: ${String(measured.failed)} failed, first: ${measured.firstFailure}`,
		)
	}
	const row = {
		name,
		perSecond: measured.count / seconds,
		p50: at(times, 0.5),
		p99: at(times, 0.99),
		cpu: (used.user + used.system) / Math.max(1, measured.count),
		failed: measured.failed,
	}
	console.error(
		`${new Date().toISOString()} ${name}: ${row.perSecond.toFixed(0)}/s, ${row.cpu.toFixed(0)} µs`,
	)
	return row
}

/** A bare `node:http` server reading one row with `pg`, the floor. */
async function floor(
	url: string,
	id: string,
	concurrency: number,
	seconds: number,
): Promise<Row> {
	const pool = new Pool({ connectionString: url, max: 10 })
	const answer = async (response: ServerResponse): Promise<void> => {
		const { rows } = await pool.query({
			name: 'floor',
			text: 'select * from post where id = $1',
			values: [id],
		})
		response.setHeader('content-type', 'application/json')
		response.end(JSON.stringify(rows[0]))
	}
	const server = createServer((_, response) => {
		void answer(response)
	})
	await new Promise<void>((done) => {
		server.listen(port, done)
	})
	try {
		return await loaded(
			'Floor: node:http and pg, read by id',
			[{ method: 'GET', path: '/', headers: {} }],
			concurrency,
			seconds,
		)
	} finally {
		server.closeAllConnections()
		await new Promise((done) => {
			server.close(done)
		})
		await pool.end()
	}
}

async function query(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

const { values } = parseArgs({
	options: {
		seconds: { type: 'string', default: '6' },
		concurrency: { type: 'string', default: '16' },
		cases: { type: 'string', default: '' },
		profile: { type: 'string' },
		url: {
			type: 'string',
			default:
				process.env['BENCH_DATABASE_URL'] ??
				'postgres://postgres:postgres@localhost:54318/postgres',
		},
		help: { type: 'boolean', default: false },
	},
})
const seconds = Number(values.seconds)
const concurrency = Number(values.concurrency)
if (values.help || !(seconds > 0) || !(concurrency > 0)) {
	console.log(usage)
	process.exit(values.help ? 0 : 1)
}

const schema = `bench_${randomUUID().replaceAll('-', '')}`
await query(values.url, `create schema "${schema}"`)
const scoped = `${values.url}?options=${encodeURIComponent(`-c search_path=${schema}`)}`
const app = defineApp({
	database: postgres({ url: scoped }),
	models: [User, Post, Comment],
	logger: silent,
	plugins: [
		httpPlugin({ port }),
		restPlugin(),
		graphqlPlugin(),
		authPlugin(),
		passwordPlugin({ signUp: ['name'], breached: false }),
	],
})
const rows: Row[] = []
try {
	await app.start()
	const credentials = { email: 'ada@example.com', password: 'correct horse' }
	const ada = await User.signUp({ ...credentials, data: { name: 'Ada' } }, M)
	const { token } = await User.signIn(credentials)
	const ids: string[] = []
	for (let index = 0; index < 2000; index += 1) {
		const post = await Post.create(
			{
				data: {
					title: `Post ${String(index)}`,
					likes: index,
					author: { connect: { id: ada.id } },
					comments: {
						create: [{ text: 'first' }, { text: 'second' }, { text: 'third' }],
					},
				},
			},
			M,
		)
		ids.push(post.id)
	}
	await query(values.url, `set search_path="${schema}"; analyze`)
	// A development start made the tables; the server measured is a production one.
	await app.stop()
	process.env['NODE_ENV'] = 'production'
	await app.start()
	console.error(`${new Date().toISOString()} seeded`)
	for (const each of casesOf(ids.slice(0, 500), token)) {
		if (!each.name.includes(values.cases)) continue
		// A cold process compiles its code during the first case: that case would
		// count a price the server pays once.
		const warm = rows.length === 0 ? coldStart : 2
		rows.push(await loaded(each.name, each.sent, concurrency, seconds, warm))
	}
	await app.stop()
	const [first = ''] = ids
	if ('Floor'.includes(values.cases) || values.cases === '') {
		rows.push(await floor(scoped, first, concurrency, seconds))
	}
} finally {
	await query(values.url, `drop schema "${schema}" cascade`)
}

console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${String(concurrency)} clients, ${String(seconds)} s a case; times in ms, CPU the server's process, in µs a request.\n`,
)
console.log('| Case | Requests /s | p50 | p99 | CPU, µs | Failed |')
console.log('| --- | --: | --: | --: | --: | --: |')
for (const row of rows) {
	console.log(
		`| ${row.name} | ${row.perSecond.toFixed(0)} | ${row.p50.toFixed(2)} | ${row.p99.toFixed(2)} | ${row.cpu.toFixed(0)} | ${String(row.failed)} |`,
	)
}
process.exit(0)

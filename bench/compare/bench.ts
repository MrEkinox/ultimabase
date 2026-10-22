// The comparison benchmark (D-100): the round trips and the time of the same
// cases on UltimaBase, Prisma, Drizzle and raw `pg`, on the same PostgreSQL.
// `node bench.ts --help`.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import type { Contender } from './contender.ts'
import { tables } from './contender.ts'
import { drizzleContender } from './drizzle.ts'
import { prismaContender } from './prisma.ts'
import { proxy } from './proxy.ts'
import { sql } from './sql.ts'
import { ultimabase } from './ultimabase.ts'

const usage = `node bench.ts [--runs <n>] [--url <postgres url>]

  --runs  timed runs of each case and contender, after a tenth as many
          untimed (200)
  --url   the PostgreSQL server; each contender works in a schema of its own,
          dropped at the end (BENCH_DATABASE_URL, else localhost:54318)`

const contenders = [ultimabase, prismaContender, drizzleContender, sql]

/** What every case of a contender starts from. */
type Seed = {
	readonly writer: string
	/** A novel in `genres[0]`, not `genres[1]`: `regenre` moves it between them. */
	readonly novel: string
	readonly genres: readonly [string, string]
}

type Case = {
	readonly name: string
	/** Untimed: what one run needs, as the argument `run` gets. */
	readonly prepare?: (contender: Contender, seed: Seed) => Promise<string>
	readonly run: (
		contender: Contender,
		seed: Seed,
		prepared: string,
	) => Promise<unknown>
}

/** How many writers the nested read returns: 3 novels each, 2 genres a novel. */
const take = 10
const moved = new Map<string, number>()

// The reads come first, so that every writer they return has the seed's
// 3 novels in 2 genres, before the writes add rows.
const cases: readonly Case[] = [
	{
		name: 'read by id',
		run: async (c, seed) => c.findWriter(seed.writer),
	},
	{
		name: `read ${take} writers, their novels and genres`,
		run: async (c) => {
			const found = await c.findWriters(take)
			if (found.length !== take) throw new Error(`${c.name} read too few.`)
			return found
		},
	},
	{ name: 'create', run: async (c) => c.createGenre('myth') },
	{
		name: 'create, a one and a many connected',
		run: async (c, seed) => c.createNovel('Notes', seed.writer, seed.genres),
	},
	{
		name: 'update by id',
		run: async (c, seed) => c.renameWriter(seed.writer, randomUUID()),
	},
	{
		name: 'update, a many disconnected and connected',
		run: async (c, seed) => {
			const runs = moved.get(c.name) ?? 0
			moved.set(c.name, runs + 1)
			const [a, b] = seed.genres
			const [from, to] = runs % 2 === 0 ? [a, b] : [b, a]
			return c.regenre(seed.novel, from, to)
		},
	},
	{
		name: 'delete by id, one novel cascaded',
		prepare: async (c, seed) => {
			const writer = await c.createWriter('Bob')
			await c.createNovel('Gone', writer.id, [seed.genres[0]])
			return writer.id
		},
		run: async (c, _seed, id) => c.deleteWriter(id),
	},
	{
		name: 'a transaction, two creates',
		run: async (c) => c.createGenres('myth', 'saga'),
	},
]

/** 10 genres and 101 writers, each of 3 novels in 2 genres. */
async function seed(contender: Contender): Promise<Seed> {
	const genres: string[] = []
	for (let index = 0; index < 10; index += 1) {
		genres.push((await contender.createGenre(`genre ${index}`)).id)
	}
	const [a, b, c] = genres
	if (a === undefined || b === undefined || c === undefined) {
		throw new Error('No genres.')
	}
	for (let index = 0; index < 100; index += 1) {
		const writer = await contender.createWriter(`writer ${index}`)
		for (let novel = 0; novel < 3; novel += 1) {
			const pair = [index + novel, index + novel + 1].map(
				(at) => genres[at % genres.length] ?? a,
			)
			await contender.createNovel(`novel ${novel}`, writer.id, pair)
		}
	}
	const writer = (await contender.createWriter('Ada')).id
	const novel = (await contender.createNovel('Engines', writer, [a, c])).id
	await contender.createNovel('Notes', writer, [b, c])
	await contender.createNovel('Letters', writer, [b, c])
	return { writer, novel, genres: [a, b] }
}

type Result = {
	readonly trips: readonly [number, number]
	readonly median: number
	readonly p95: number
}

/** The value at `share` of the sorted `values`. */
const at = (values: readonly number[], share: number): number =>
	values[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0

async function measure(
	each: Case,
	contender: Contender,
	given: Seed,
	runs: number,
	counted: () => number,
): Promise<Result> {
	const times: number[] = []
	let fewest = Infinity
	let most = 0
	for (let index = -Math.ceil(runs / 10); index < runs; index += 1) {
		const prepared = (await each.prepare?.(contender, given)) ?? ''
		const before = counted()
		const start = performance.now()
		await each.run(contender, given, prepared)
		const time = performance.now() - start
		const trips = counted() - before
		fewest = Math.min(fewest, trips)
		most = Math.max(most, trips)
		if (index >= 0) times.push(time)
	}
	times.sort((a, b) => a - b)
	return { trips: [fewest, most], median: at(times, 0.5), p95: at(times, 0.95) }
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

/** `url` with its `search_path` set to `schema`. */
function within(url: string, schema: string): string {
	const scoped = new URL(url)
	scoped.searchParams.set('options', `-c search_path=${schema}`)
	return scoped.toString()
}

/** The versions this project pins, from its package.json. */
function versions(): Record<string, string> {
	const parsed: unknown = JSON.parse(
		readFileSync(new URL('package.json', import.meta.url), 'utf8'),
	)
	const pinned: Record<string, string> = {}
	if (typeof parsed !== 'object' || parsed === null) return pinned
	for (const key of ['dependencies', 'devDependencies']) {
		const group: unknown = Reflect.get(parsed, key)
		if (typeof group !== 'object' || group === null) continue
		for (const [name, version] of Object.entries(group)) {
			if (typeof version === 'string') pinned[name] = version
		}
	}
	return pinned
}

const { values } = parseArgs({
	options: {
		runs: { type: 'string', default: '200' },
		url: {
			type: 'string',
			default:
				process.env['BENCH_DATABASE_URL'] ??
				'postgres://postgres:postgres@localhost:54318/postgres',
		},
		help: { type: 'boolean', default: false },
	},
})
const runs = Number(values.runs)
if (values.help || !Number.isInteger(runs) || runs < 1) {
	console.log(usage)
	process.exit(values.help ? 0 : 1)
}

const [server] = await query(values.url, 'show server_version')
const version =
	typeof server === 'object' && server !== null && 'server_version' in server
		? String(server.server_version)
		: 'unknown'
const counter = await proxy(values.url)
const schemas = new Map<Contender, string>()
const seeds = new Map<Contender, Seed>()
const results = new Map<string, Map<Contender, Result>>()
try {
	for (const contender of contenders) {
		const schema = `compare_${randomUUID().replaceAll('-', '')}`
		await query(values.url, `create schema "${schema}"`)
		schemas.set(contender, schema)
		const url = within(counter.url, schema)
		if (!contender.createsTables) await query(url, tables)
		await contender.start(url, schema)
		seeds.set(contender, await seed(contender))
	}
	// Each case runs on every contender in turn, so drift hits all alike.
	for (const each of cases) {
		const row = new Map<Contender, Result>()
		for (const [contender, given] of seeds) {
			row.set(
				contender,
				await measure(each, contender, given, runs, counter.count),
			)
		}
		results.set(each.name, row)
	}
} finally {
	for (const contender of seeds.keys()) await contender.stop()
	await counter.close()
	for (const schema of schemas.values()) {
		await query(values.url, `drop schema "${schema}" cascade`)
	}
}

const pinned = versions()
const trips = ({ trips: [fewest, most] }: Result): string =>
	fewest === most ? String(fewest) : `${fewest}–${most}`
const ms = (value: number): string => value.toFixed(2)

function table(title: string, cell: (result: Result) => string): void {
	console.log(`\n${title}\n`)
	console.log(`| Case | ${contenders.map((c) => c.name).join(' | ')} |`)
	console.log(`| --- |${contenders.map(() => ' --: |').join('')}`)
	for (const [name, row] of results) {
		const cells = contenders.map((c) => {
			const result = row.get(c)
			return result === undefined ? '' : cell(result)
		})
		console.log(`| ${name} | ${cells.join(' | ')} |`)
	}
}

console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, PostgreSQL ${version}, ${runs} runs a case; Prisma ${pinned['prisma']}, Drizzle ${pinned['drizzle-orm']}, pg ${pinned['pg']}.`,
)
table('Round trips', trips)
table('Median, ms', (result) => ms(result.median))
table('95th percentile, ms', (result) => ms(result.p95))

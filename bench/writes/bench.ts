// The write benchmark (D-48, D-99): the round trips and the time of each
// write case, on `memory()` and PostgreSQL, so that an optimization can be
// compared with the run before it. `node bench/writes/bench.ts --help`.
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { Client } from 'pg'
import type { Adapter, Caller, Transaction } from 'ultimabase'
import { defineApp, defineModel, master, memory, transaction } from 'ultimabase'
import { createAdapter } from '../../packages/postgres/src/adapter.ts'
import { asUser } from '../../packages/testing/src/as-user.ts'
import { silent } from '../../packages/testing/src/silent.ts'

const usage = `node bench/writes/bench.ts [--runs <n>] [--url <postgres url>]

  --runs  timed runs of each case, after a tenth as many untimed (200)
  --url   the PostgreSQL server; the benchmark works in a schema of its own
          and drops it (BENCH_DATABASE_URL, else localhost:54318)`

const M = { as: master }
const user: Caller = asUser({ id: '00000000-0000-4000-8000-000000000000' })
const U = { as: user }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ name: f.string(), novels: f.many(() => Novel) }),
})

const Novel = defineModel({
	name: 'Novel',
	fields: (f) => ({
		title: f.string(),
		writer: f.one(() => Writer, { onDelete: 'cascade' }),
		genres: f.many(() => Genre),
	}),
})

const Genre = defineModel({
	name: 'Genre',
	fields: (f) => ({ label: f.string(), novels: f.many(() => Novel) }),
})

const open = () => true
/** Access rules: a user's update or delete loads the row they decide from. */
const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ label: f.string({ unique: true }) }),
}).with({ access: { read: open, create: open, update: open, delete: open } })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
}).with({ hooks: { afterCreate: async () => {} } })

const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({ text: f.string() }),
}).with({ hooks: { afterCreateCommit: async () => {} } })

const models = [Writer, Novel, Genre, Shelf, Note, Memo]

/** The rows every case starts from. */
type Seed = {
	readonly writer: string
	readonly novel: string
	readonly genres: readonly [string, string]
}

type Case = {
	readonly name: string
	/** Untimed: what one run needs, as the argument `run` gets. */
	readonly prepare?: () => Promise<string>
	readonly run: (prepared: string) => Promise<unknown>
}

function cases(seed: Seed): Case[] {
	let linked = 0
	return [
		{
			name: 'create',
			run: async () => Genre.create({ data: { label: 'myth' } }, M),
		},
		{
			name: 'create, a one and a many connected',
			run: async () =>
				Novel.create(
					{
						data: {
							title: 'Notes',
							writer: { connect: { id: seed.writer } },
							genres: { connect: [{ id: seed.genres[0] }] },
						},
					},
					M,
				),
		},
		{
			name: 'update by id, Master',
			run: async () =>
				Writer.update(
					{ where: { id: seed.writer }, data: { name: randomUUID() } },
					M,
				),
		},
		{
			name: 'update by id, a user under access rules',
			prepare: async () =>
				(await Shelf.create({ data: { label: randomUUID() } }, M)).id,
			run: async (id) =>
				Shelf.update({ where: { id }, data: { label: randomUUID() } }, U),
		},
		{
			name: 'delete by id, a user under access rules',
			prepare: async () =>
				(await Shelf.create({ data: { label: randomUUID() } }, M)).id,
			run: async (id) => Shelf.delete({ where: { id } }, U),
		},
		{
			name: 'delete by id, Master, one row cascaded',
			prepare: async () => {
				const writer = await Writer.create({ data: { name: 'Bob' } }, M)
				const data = { title: 'Gone', writer: { connect: { id: writer.id } } }
				await Novel.create({ data }, M)
				return writer.id
			},
			run: async (id) => Writer.delete({ where: { id } }, M),
		},
		{
			name: 'update, a many disconnected and connected',
			run: async () => {
				const [a, b] = seed.genres
				const [from, to] = linked++ % 2 === 0 ? [a, b] : [b, a]
				return Novel.update(
					{
						where: { id: seed.novel },
						data: {
							genres: {
								disconnect: [{ id: from }],
								connect: [{ id: to }],
							},
						},
					},
					M,
				)
			},
		},
		{
			name: 'update, connected from the other side',
			run: async () =>
				Genre.update(
					{
						where: { id: seed.genres[1] },
						data: { novels: { connect: [{ id: seed.novel }] } },
					},
					M,
				),
		},
		{
			name: 'create, an afterCreate hook',
			run: async () => Note.create({ data: { text: 'hi' } }, M),
		},
		{
			name: 'create, an afterCreateCommit hook',
			run: async () => Memo.create({ data: { text: 'hi' } }, M),
		},
		{
			name: 'transaction(), two creates',
			run: async () =>
				transaction(async () => {
					await Genre.create({ data: { label: 'myth' } }, M)
					await Genre.create({ data: { label: 'saga' } }, M)
				}),
		},
	]
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
	runs: number,
	counted: () => number,
): Promise<Result> {
	const times: number[] = []
	let fewest = Infinity
	let most = 0
	for (let index = -Math.ceil(runs / 10); index < runs; index += 1) {
		const prepared = (await each.prepare?.()) ?? ''
		const before = counted()
		const start = performance.now()
		await each.run(prepared)
		const time = performance.now() - start
		const trips = counted() - before
		fewest = Math.min(fewest, trips)
		most = Math.max(most, trips)
		if (index >= 0) times.push(time)
	}
	times.sort((a, b) => a - b)
	return { trips: [fewest, most], median: at(times, 0.5), p95: at(times, 0.95) }
}

async function bench(
	database: Adapter,
	runs: number,
	counted: () => number,
): Promise<Map<string, Result>> {
	const app = defineApp({ database, models, logger: silent })
	await app.start()
	try {
		const genre = async (label: string) =>
			(await Genre.create({ data: { label } }, M)).id
		const genres = [await genre('tale'), await genre('saga')] as const
		const writer = (await Writer.create({ data: { name: 'Ada' } }, M)).id
		const data = {
			title: 'Engines',
			writer: { connect: { id: writer } },
			genres: { connect: [{ id: genres[0] }] },
		}
		const novel = (await Novel.create({ data }, M)).id
		const results = new Map<string, Result>()
		for (const each of cases({ writer, novel, genres })) {
			results.set(each.name, await measure(each, runs, counted))
		}
		return results
	} finally {
		await app.stop()
	}
}

/** `memory()`, each call it receives counted as one round trip. */
function countedMemory(): { adapter: Adapter; counted: () => number } {
	let calls = 0
	const trip =
		<A extends unknown[], R>(run: (...given: A) => Promise<R>) =>
		async (...given: A): Promise<R> => {
			calls += 1
			return run(...given)
		}
	const adapter = memory()
	const counting: Adapter = {
		...adapter,
		find: trip(async (read) => adapter.find(read)),
		count: trip(async (read) => adapter.count(read)),
		write: trip(async (write) => adapter.write(write)),
		begin: trip(async (): Promise<Transaction> => {
			const tx = await adapter.begin()
			return {
				find: trip(async (read) => tx.find(read)),
				count: trip(async (read) => tx.count(read)),
				write: trip(async (write) => tx.write(write)),
				commit: trip(async () => tx.commit()),
				rollback: trip(async () => tx.rollback()),
			}
		}),
	}
	return { adapter: counting, counted: () => calls }
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

/** PostgreSQL in a schema of its own, each statement it runs counted. */
async function onPostgres(
	url: string,
	runs: number,
): Promise<{ version: string; results: Map<string, Result> }> {
	const [row] = await query(url, 'show server_version')
	const version =
		typeof row === 'object' && row !== null && 'server_version' in row
			? String(row.server_version)
			: 'unknown'
	const schema = `bench_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	try {
		let statements = 0
		const separator = url.includes('?') ? '&' : '?'
		const options = encodeURIComponent(`-c search_path=${schema}`)
		const adapter = createAdapter({
			url: `${url}${separator}options=${options}`,
			log: () => {
				statements += 1
			},
		})
		const results = await bench(adapter, runs, () => statements)
		return { version, results }
	} finally {
		await query(url, `drop schema "${schema}" cascade`)
	}
}

const trips = ({ trips: [fewest, most] }: Result): string =>
	fewest === most ? String(fewest) : `${fewest}–${most}`
const ms = (value: number): string => value.toFixed(2)

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

const inMemory = countedMemory()
const local = await bench(inMemory.adapter, runs, inMemory.counted)
const remote = await onPostgres(values.url, runs)
const host = new URL(values.url).host

console.log(
	`${new Date().toISOString().slice(0, 10)}, Node ${process.version}, PostgreSQL ${remote.version} at ${host}, ${runs} runs a case; times in ms.\n`,
)
console.log(
	'| Case | memory trips | memory median | PostgreSQL trips | PostgreSQL median | PostgreSQL p95 |',
)
console.log('| --- | --: | --: | --: | --: | --: |')
for (const [name, result] of local) {
	const other = remote.results.get(name)
	if (other === undefined) continue
	console.log(
		`| ${name} | ${trips(result)} | ${ms(result.median)} | ${trips(other)} | ${ms(other.median)} | ${ms(other.p95)} |`,
	)
}

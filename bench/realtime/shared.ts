// What the live list benchmarks share: a schema of their own, its statements
// counted, and the median of three writes (D-252).
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtimePlugin } from '@ultimabase/realtime'
import type { PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import { createAdapter } from '../../packages/postgres/src/adapter.ts'
import { asUser } from '../../packages/testing/src/as-user.ts'

export const urlOf = (asked: string | undefined): string =>
	asked ??
	process.env['BENCH_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54318/postgres'

export const waited = async (delay: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, delay)
	})

export const median = (values: readonly number[]): number =>
	values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

async function query(url: string, text: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(text)
	} finally {
		await client.end()
	}
}

/** A running app, and what a write costs it. */
export type Bench = {
	readonly api: RealtimeApi
	/** Gives the tables their planner statistics, as production has them. */
	readonly analyzed: () => Promise<void>
	readonly statements: () => number
	/** Resolves once no statement ran for a while. */
	readonly quiet: () => Promise<void>
}

let api: RealtimeApi | undefined
interface Measured extends PluginTypes {
	readonly name: 'bench'
	readonly requires: Realtime
}
const measured = definePlugin<Measured>({
	name: 'bench',
	manifest: {
		name: 'bench',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins: { realtime } }) => {
		api = realtime
	},
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

/** The plugins of a benchmark's app: its lists are limited by nothing. */
export const plugins = [
	realtimePlugin({ maxLive: 10_000_000, maxConnectionRows: 100_000_000 }),
	measured.plugin(),
] as const

/** Runs `body` on the app `built` makes, in a schema dropped at the end. */
export async function benched(
	url: string,
	built: (database: ReturnType<typeof createAdapter>) => {
		readonly start: () => Promise<unknown>
		readonly stop: () => Promise<unknown>
	},
	body: (bench: Bench) => Promise<void>,
): Promise<void> {
	const schema = `rt_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	let statements = 0
	const options = encodeURIComponent(`-c search_path=${schema}`)
	try {
		const app = built(
			createAdapter({
				url: `${url}?options=${options}`,
				log: () => {
					statements += 1
				},
			}),
		)
		await app.start()
		try {
			if (api === undefined) {
				throw new Error('The realtime plugin did not start.')
			}
			await body({
				api,
				analyzed: async () =>
					query(url, `set search_path="${schema}"; analyze`),
				statements: () => statements,
				quiet: async () => {
					let seen: number
					do {
						seen = statements
						await waited(150)
					} while (statements !== seen)
				},
			})
		} finally {
			await app.stop()
		}
	} finally {
		await query(url, `drop schema "${schema}" cascade`)
	}
}

/**
 * Three runs of `write`, medians of its statements and of the time until
 * `reached` says all were told.
 */
export async function timed(
	bench: Bench,
	write: (run: number) => Promise<unknown>,
	reached: () => boolean,
	began: (started: boolean) => void,
): Promise<{ readonly statements: number; readonly lastMs: number }> {
	const statements: number[] = []
	const times: number[] = []
	for (let run = 0; run < 3; run += 1) {
		began(true)
		const before = bench.statements()
		await write(run)
		const start = performance.now()
		const deadline = start + 60_000
		while (!reached() && performance.now() < deadline) await waited(1)
		times.push(performance.now() - start)
		await bench.quiet()
		began(false)
		statements.push(bench.statements() - before)
	}
	return { statements: median(statements), lastMs: median(times) }
}

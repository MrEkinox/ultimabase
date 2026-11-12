// Claims at once (D-221): instances that read the same due row each run it
// only when their conditional update counted it, so each run runs once; the
// runs of a key run one at a time (D-365).
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineApp } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import { defineJob, jobsPlugin } from './index.ts'
import { JobsRun, M } from './model.ts'
import { drain, start } from './runner.ts'
import { runningOf } from './state.ts'
import { database, urls } from './test/postgres.ts'

const ran = new Map<string, number>()
const counted = defineJob({
	name: 'counted',
	// Long enough that the other instances read the row while it runs.
	run: async ({ id }) => {
		ran.set(id, (ran.get(id) ?? 0) + 1)
		await new Promise((resolve) => setTimeout(resolve, 20))
	},
})

// The runs of each account running, and whether two of one ran at once.
const active = new Map<string, number>()
let overlapped = false
const serial = defineJob({
	name: 'serial',
	input: z.object({ account: z.string() }),
	key: ({ account }) => account,
	run: async ({ id, input }) => {
		const count = (active.get(input.account) ?? 0) + 1
		if (count > 1) overlapped = true
		active.set(input.account, count)
		ran.set(id, (ran.get(id) ?? 0) + 1)
		await new Promise((resolve) => setTimeout(resolve, 20))
		active.set(input.account, count - 1)
	},
})

/** Starts an application on a fresh schema of `url`; stops it after `test`. */
async function on(url: string, test: () => Promise<void>): Promise<void> {
	ran.clear()
	const runs = quietRuns(
		defineApp({
			database: database(url, `t_${randomUUID().replaceAll('-', '')}`),
			models: [],
			plugins: [jobsPlugin({ jobs: [counted, serial] })],
		}),
	)
	if (runs === undefined) throw new Error('No runs.')
	const running = runs.on(runs.declared)
	await running.start()
	try {
		await test()
	} finally {
		vi.useRealTimers()
		await running.stop()
	}
}

for (const url of urls) {
	it(`runs each run once when instances claim at once on ${new URL(url).host}`, async () => {
		await on(url, async () => {
			// Due in an hour, so no run starts at its commit, however long the
			// writes take; then the clock, the date alone, moves past it.
			await Promise.all(
				Array.from({ length: 30 }, async () =>
					counted.enqueue({ after: 60 * 60 * 1000 }),
				),
			)
			vi.useFakeTimers({ toFake: ['Date'] })
			vi.setSystemTime(Date.now() + 60 * 60 * 1000)
			const app = runningOf('the test')
			// Three instances that read the same due rows claim each at once.
			const rows = await JobsRun.findMany({ select: { id: true } }, M)
			expect(rows).toHaveLength(30)
			const claims = rows.flatMap(({ id }) => [id, id, id])
			const won = await Promise.all(
				claims.map(async (id) => start(app, { id, key: null })),
			)
			expect(won.filter(Boolean)).toHaveLength(30)
			await drain(app)
			expect(ran.size).toBe(30)
			expect([...ran.values()].every((times) => times === 1)).toBe(true)
			expect(await JobsRun.count({}, M)).toBe(0)
		})
	})

	it(`runs the runs of a key one at a time when instances claim at once on ${new URL(url).host}`, async () => {
		await on(url, async () => {
			const dueAt = new Date(Date.now() + 60 * 60 * 1000)
			const data = (account: string) => {
				const input: unknown = { account }
				return {
					job: 'serial',
					input,
					key: JSON.stringify(['serial', account]),
					state: 'pending',
					dueAt,
					attempts: 0,
				}
			}
			// Rows a waiting run did not take: enqueued one by one as each ran.
			for (const account of ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b']) {
				await JobsRun.create({ data: data(account) }, M)
			}
			vi.useFakeTimers({ toFake: ['Date'] })
			vi.setSystemTime(Date.now() + 60 * 60 * 1000)
			const app = runningOf('the test')
			const rows = await JobsRun.findMany(
				{ select: { id: true, key: true } },
				M,
			)
			// Three instances that read the same due rows claim each at once.
			await Promise.all(
				rows
					.flatMap((row) => [row, row, row])
					.map(async (row) => start(app, row)),
			)
			await drain(app)
			expect(overlapped).toBe(false)
			expect(ran.size).toBe(8)
			expect([...ran.values()].every((times) => times === 1)).toBe(true)
			expect(await JobsRun.count({}, M)).toBe(0)
		})
	})
}

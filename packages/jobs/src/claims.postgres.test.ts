// Claims at once (D-221): instances that read the same due row each run it
// only when their conditional update counted it, so each run runs once.
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
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

for (const url of urls) {
	it(`runs each run once when instances claim at once on ${new URL(url).host}`, async () => {
		ran.clear()
		const runs = quietRuns(
			defineApp({
				database: database(url, `t_${randomUUID().replaceAll('-', '')}`),
				models: [],
				plugins: [jobsPlugin({ jobs: [counted] })],
			}),
		)
		if (runs === undefined) throw new Error('No runs.')
		const running = runs.on(runs.declared)
		await running.start()
		try {
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
			const won = await Promise.all(claims.map(async (id) => start(app, id)))
			expect(won.filter(Boolean)).toHaveLength(30)
			await drain(app)
			expect(ran.size).toBe(30)
			expect([...ran.values()].every((times) => times === 1)).toBe(true)
			expect(await JobsRun.count({}, M)).toBe(0)
		} finally {
			vi.useRealTimers()
			await running.stop()
		}
	})
}

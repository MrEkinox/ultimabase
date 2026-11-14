// A run's lease (D-221 point 7) on `memory()`: renewed while the run runs,
// each claim counted as an attempt, and a stop that waits ten seconds at most.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, memory } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import { defineJob, jobsPlugin } from './index.ts'
import { lease } from './lease.ts'
import { JobsRun, M } from './model.ts'
import { settled, start } from './runner.ts'
import { runningOf } from './state.ts'
import { kept } from './test/kept.ts'

const lines: { level: string; message: string; facts: object }[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (facts: object | string, message?: string) => {
		const known = typeof facts === 'object' ? facts : {}
		lines.push({ level: 'warn', message: String(message), facts: known })
	},
	error: (facts: object | string, message?: string) => {
		const known = typeof facts === 'object' ? facts : {}
		lines.push({ level: 'error', message: String(message), facts: known })
	},
	child: () => logger,
}

// Each run waits for its own gate; `ending` opens the oldest.
const gates: (() => void)[] = []
const ending = () => gates.shift()?.()
let runs = 0
const long = defineJob({
	name: 'long',
	run: async () => {
		runs += 1
		await new Promise<void>((resolve) => gates.push(resolve))
	},
})
const minute = 60 * 1000

// A test that failed leaves no run to the next: its gates open before its
// application stops, as hooks run last registered first.
const release = async () => {
	for (const open of gates.splice(0)) open()
	vi.useRealTimers()
	await settled()
}
afterEach(async () => {
	await release()
	lines.length = 0
	runs = 0
})

describe('a running row', () => {
	testApplication(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs: [long] })],
			logger,
		}),
	)
	afterEach(release)

	it('keeps its lease while its run runs, past five minutes', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
		await long.enqueue()
		await vi.waitFor(() => {
			expect(runs).toBe(1)
		})
		const [row] = await JobsRun.findMany({}, M)
		if (row === undefined) throw new Error('No row.')
		expect(row.attempts).toBe(1)
		await vi.advanceTimersByTimeAsync(6 * minute)
		// Another instance finds it held.
		const other = start(runningOf('test'), row)
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(runs).toBe(1)
		ending()
		expect(await other).toBe(false)
		await vi.waitFor(async () => {
			expect(await JobsRun.count({}, M)).toBe(0)
		})
		expect(lines).toStrictEqual([
			{
				level: 'warn',
				message: 'The job long has run 5 minutes.',
				facts: { job: 'long', run: row.id },
			},
		])
	})

	it('turns failed once its last ten runs never ended', async () => {
		vi.useFakeTimers({ toFake: ['Date'] })
		await long.enqueue({ after: 1000 })
		const [row] = await JobsRun.findMany({}, M)
		if (row === undefined) throw new Error('No row.')
		const app = runningOf('test')
		// Each run stops its instance: its lease runs out, another takes it.
		const started: Promise<boolean>[] = []
		for (let run = 1; run <= 10; run += 1) {
			vi.setSystemTime(Date.now() + lease + 1)
			started.push(start(app, row))
			await vi.waitFor(() => {
				expect(runs).toBe(run)
			})
		}
		vi.setSystemTime(Date.now() + lease + 1)
		const last = start(app, row)
		await vi.waitFor(async () => {
			expect(await JobsRun.findMany({}, M)).toMatchObject([
				{
					state: 'failed',
					attempts: 11,
					error: 'Its last 10 runs never ended.',
				},
			])
		})
		expect(await last).toBe(true)
		expect(runs).toBe(10)
		expect(lines).toContainEqual({
			level: 'error',
			message: 'The job long never ended its last 10 runs: its run is kept.',
			facts: { job: 'long', run: row.id },
		})
		for (const open of gates.splice(0)) open()
		await Promise.all(started)
	})
})

describe('an instance that stops', () => {
	it('waits ten seconds at most for its runs, and names those left', async () => {
		const database = kept()
		const app = quietRuns(
			defineApp({
				database,
				models: [],
				plugins: [jobsPlugin({ jobs: [long] })],
				logger,
			}),
		)
		if (app === undefined) throw new Error('No runs.')
		const running = app.on(database)
		await running.start()
		await long.enqueue()
		await vi.waitFor(() => {
			expect(runs).toBe(1)
		})
		const [row] = await JobsRun.findMany({}, M)
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		let stopped = false
		const stopping = (async () => {
			await running.stop()
			stopped = true
		})()
		await vi.advanceTimersByTimeAsync(9999)
		expect(stopped).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		await stopping
		expect(lines).toStrictEqual([
			{
				level: 'warn',
				message:
					'Stopped with 1 job runs still running: they run again once their lease ends.',
				facts: { runs: [row?.id] },
			},
		])
	})
})

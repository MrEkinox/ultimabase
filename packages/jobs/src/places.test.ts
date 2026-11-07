// Places (D-302) on `memory()`: an instance runs at most 20 runs at once,
// kicked at their commit or found by the poll; a slow run holds only its own
// place; the runs waiting for one are dropped when the instance stops; a
// failure outside a job ends the poll and fails runJobs().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runJobs, testApplication } from '@ultimabase/testing'
import type { Adapter, Logger } from 'ultimabase'
import { defineApp, memory } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import { defineJob, jobsPlugin } from './index.ts'
import { JobsRun, M } from './model.ts'
import { drain, passes } from './runner.ts'
import { runningOf } from './state.ts'
import { kept } from './test/kept.ts'

const lines: { level: string; message: string }[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (_facts: object | string, message?: string) => {
		lines.push({ level: 'warn', message: String(message) })
	},
	error: (_facts: object | string, message?: string) => {
		lines.push({ level: 'error', message: String(message) })
	},
	child: () => logger,
}

// The held runs wait for the gate; `release` opens it.
let release: () => void = () => undefined
let gate: Promise<void> = Promise.resolve()
function shut(): void {
	gate = new Promise((resolve) => {
		release = resolve
	})
}
let inFlight = 0
let peak = 0
let held = 0
const holding = defineJob({
	name: 'holding',
	run: async () => {
		inFlight += 1
		peak = Math.max(peak, inFlight)
		try {
			await gate
		} finally {
			inFlight -= 1
			held += 1
		}
	},
})
let quick = 0
const quickly = defineJob({
	name: 'quickly',
	run: () => {
		quick += 1
	},
})

const hour = 60 * 60 * 1000

// `memory()`, whose writes fail while `down` is set, as a database that is down.
let down = false
function failing(): Adapter {
	const base = memory()
	return {
		...base,
		write: async (write) => {
			if (down) throw new Error('Down.')
			return base.write(write)
		},
	}
}
const jobs = [holding, quickly]

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	lines.length = 0
	inFlight = 0
	peak = 0
	held = 0
	quick = 0
	down = false
})
afterEach(() => {
	release()
	vi.useRealTimers()
})

describe('an instance', () => {
	testApplication(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs })],
			logger,
		}),
	)

	it('runs at most 20 runs at once, however many commits kick one', async () => {
		shut()
		await Promise.all(Array.from({ length: 50 }, async () => holding.enqueue()))
		await vi.waitFor(() => {
			expect(inFlight).toBe(20)
		})
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(peak).toBe(20)
		release()
		await runJobs()
		expect(held).toBe(50)
		expect(peak).toBe(20)
		expect(await JobsRun.count({}, M)).toBe(0)
	})

	it('runs the due rows past a slow one, which holds only its place', async () => {
		shut()
		await holding.enqueue({ after: hour })
		await Promise.all(
			Array.from({ length: 30 }, async () => quickly.enqueue({ after: hour })),
		)
		vi.setSystemTime(Date.now() + hour)
		// The poll's passes end while the slow run still holds its place.
		await passes(runningOf('the test'))
		await vi.waitFor(() => {
			expect(quick).toBe(30)
		})
		expect(held).toBe(0)
		release()
		await runJobs()
		expect(held).toBe(1)
	})
})

describe('an instance whose database is down', () => {
	it('ends the poll and fails runJobs() when a run fails outside its job', async () => {
		const database = failing()
		const runs = quietRuns(
			defineApp({
				database,
				models: [],
				plugins: [jobsPlugin({ jobs })],
				logger,
			}),
		)
		if (runs === undefined) throw new Error('No runs.')
		const running = runs.on(database)
		await running.start()
		try {
			await Promise.all(
				Array.from({ length: 30 }, async () =>
					quickly.enqueue({ after: hour }),
				),
			)
			vi.setSystemTime(Date.now() + hour)
			down = true
			const app = runningOf('the test')
			// Neither spins on the rows it cannot claim.
			await passes(app)
			await expect(drain(app)).rejects.toThrow('runJobs could not run a job.')
			expect(lines).toContainEqual({
				level: 'error',
				message: 'A job could not run.',
			})
			expect(quick).toBe(0)
			down = false
			await drain(app)
			expect(quick).toBe(30)
		} finally {
			down = false
			await running.stop()
		}
	})
})

describe('an instance that stops', () => {
	it('drops the runs waiting for a place: their rows stay due', async () => {
		const database = kept()
		const runs = quietRuns(
			defineApp({
				database,
				models: [],
				plugins: [jobsPlugin({ jobs })],
				logger,
			}),
		)
		if (runs === undefined) throw new Error('No runs.')
		const first = runs.on(database)
		await first.start()
		shut()
		await Promise.all(Array.from({ length: 25 }, async () => holding.enqueue()))
		await vi.waitFor(() => {
			expect(inFlight).toBe(20)
		})
		const stopped = first.stop()
		release()
		await stopped
		expect(held).toBe(20)
		const second = runs.on(database)
		await second.start()
		// The next instance's first poll runs them.
		await vi.waitFor(() => {
			expect(held).toBe(25)
		})
		await second.stop()
	})
})

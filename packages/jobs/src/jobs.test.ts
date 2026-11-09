// Jobs (D-221) on `memory()`: a run enqueued in a transaction exists if and
// only if it commits, runs once committed or once due, fails again later up
// to ten attempts, and recurring jobs run on their schedule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { runJobs, testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, memory, PublicError, transaction } from 'ultimabase'
import type { Job } from './index.ts'
import { defineJob, jobsPlugin } from './index.ts'
import { JobsRun, M } from './model.ts'

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

const closed: { room: string; id: string }[] = []
const closeRoom = defineJob({
	name: 'closeRoom',
	input: z.object({ room: z.string().transform((room) => room.trim()) }),
	run: ({ input, id }) => {
		closed.push({ room: input.room, id })
	},
})

let failures = 0
const flaky = defineJob({
	name: 'flaky',
	run: () => {
		if (failures > 0) {
			failures--
			throw new Error('Not yet.')
		}
		closed.push({ room: 'flaky', id: '' })
	},
})

let chained = 0
const chain = defineJob({
	name: 'chain',
	run: async () => {
		chained++
		if (chained < 3) await chain.enqueue()
	},
})
const forever: Job<'forever', never> = defineJob({
	name: 'forever',
	run: () => forever.enqueue(),
})
let thrown: unknown
const throwing = defineJob({
	name: 'throwing',
	run: () => {
		throw thrown
	},
})
const outside = defineJob({ name: 'outside', run: () => undefined })
const inputs: unknown[] = []
const dated = defineJob({
	name: 'dated',
	input: z.object({ at: z.date(), note: z.string().optional() }).optional(),
	run: ({ input }) => {
		inputs.push(input)
	},
})

const app = defineApp({
	database: memory(),
	models: [],
	plugins: [
		jobsPlugin({ jobs: [closeRoom, flaky, chain, forever, dated, throwing] }),
	],
	logger,
})

/** The rows of `JobsRun`, by due time. */
const rows = () => JobsRun.findMany({ orderBy: [{ dueAt: 'asc' }] }, M)

const start = new Date('2027-01-04T08:00:00Z')
const minute = 60 * 1000

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(start)
	closed.length = 0
	inputs.length = 0
	lines.length = 0
	failures = 0
	chained = 0
})
afterEach(() => {
	vi.useRealTimers()
})

describe('a job enqueued', () => {
	testApplication(app)

	it('runs once its transaction commits, with its validated input', async () => {
		await transaction(async () => {
			await closeRoom.enqueue({ room: ' r1 ' })
			expect(closed).toStrictEqual([])
		})
		await runJobs()
		expect(closed).toMatchObject([{ room: 'r1' }])
		expect(closed[0]?.id).toMatch(/./)
		// A run that succeeds leaves no row.
		expect(await rows()).toStrictEqual([])
	})

	it('does not exist when its transaction rolls back', async () => {
		await expect(
			transaction(async () => {
				await closeRoom.enqueue({ room: 'r1' })
				throw new Error('Rolled back.')
			}),
		).rejects.toThrow('Rolled back.')
		await runJobs()
		expect(closed).toStrictEqual([])
		expect(await rows()).toStrictEqual([])
	})

	it('refuses an invalid input as VALIDATION_FAILED', async () => {
		const refused = closeRoom.enqueue(
			// @ts-expect-error: room is a string.
			{ room: 1 },
		)
		await expect(refused).rejects.toBeInstanceOf(PublicError)
		await expect(refused).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['room'] }] },
		})
		expect(await rows()).toStrictEqual([])
	})

	it('stores its input as JSON: a date as its ISO string, an undefined key left out (D-352)', async () => {
		await dated.enqueue({ at: start, note: undefined })
		await runJobs()
		expect(inputs).toStrictEqual([{ at: start.toISOString() }])
		await dated.enqueue(undefined)
		await runJobs()
		expect(inputs).toStrictEqual([{ at: start.toISOString() }, null])
	})

	it('waits for its delay', async () => {
		await closeRoom.enqueue({ room: 'r1' }, { after: 10 * minute })
		await runJobs()
		expect(closed).toStrictEqual([])
		const [row] = await rows()
		expect(row?.dueAt).toStrictEqual(new Date(start.getTime() + 10 * minute))
		vi.setSystemTime(start.getTime() + 10 * minute)
		await runJobs()
		expect(closed).toHaveLength(1)
	})

	it('refuses a delay that is no positive number of milliseconds', async () => {
		for (const after of [0, -1, Number.NaN, '10 minutes']) {
			await expect(
				// @ts-expect-error: after is a number.
				flaky.enqueue({ after }),
			).rejects.toThrow('flaky: after is a positive number of milliseconds.')
		}
	})

	it('refuses a job that is not in jobsPlugin’s jobs', async () => {
		await expect(outside.enqueue()).rejects.toThrow(
			"outside is not in jobsPlugin's jobs.",
		)
	})

	it('runs the runs its runs enqueue', async () => {
		await chain.enqueue()
		await runJobs()
		expect(chained).toBe(3)
	})

	it('stops runJobs() after 100 passes of a job that enqueues itself', async () => {
		await forever.enqueue()
		await expect(runJobs()).rejects.toThrow('runJobs stopped after 100 passes')
	})
})

describe('a run that fails', () => {
	testApplication(app)

	it('runs again after 10 s, twice as long each time', async () => {
		failures = 2
		await flaky.enqueue()
		await runJobs()
		const [first] = await rows()
		expect(first).toMatchObject({
			state: 'pending',
			attempts: 1,
			error: 'Not yet.',
			lockedUntil: null,
			dueAt: new Date(start.getTime() + 10_000),
		})
		vi.setSystemTime(start.getTime() + 10_000)
		await runJobs()
		const [second] = await rows()
		expect(second?.dueAt).toStrictEqual(new Date(start.getTime() + 30_000))
		vi.setSystemTime(start.getTime() + 30_000)
		await runJobs()
		expect(closed).toHaveLength(1)
		expect(await rows()).toStrictEqual([])
		expect(lines).toStrictEqual([
			{ level: 'warn', message: 'The job flaky failed: it runs again.' },
			{ level: 'warn', message: 'The job flaky failed: it runs again.' },
		])
	})

	it('turns failed after ten attempts, and is kept', async () => {
		failures = 10
		await flaky.enqueue()
		for (let tried = 0; tried < 10; tried++) {
			await runJobs()
			const [row] = await rows()
			if (row !== undefined) vi.setSystemTime(row.dueAt)
		}
		await runJobs()
		expect(closed).toStrictEqual([])
		expect(await rows()).toMatchObject([
			{ state: 'failed', attempts: 10, error: 'Not yet.' },
		])
		expect(lines.at(-1)).toStrictEqual({
			level: 'error',
			message: 'The job flaky failed: its run is kept.',
		})
		// About 2 h 50: 10 s, then twice as long each time, nine times.
		expect(Date.now() - start.getTime()).toBe(10_000 * (2 ** 9 - 1))
	})

	it('stores a message the database cannot store, made storable (D-352)', async () => {
		thrown = new Error('a\0b\uD800c')
		await throwing.enqueue()
		await runJobs()
		expect(await rows()).toMatchObject([
			{ state: 'pending', attempts: 1, error: 'ab\uFFFDc' },
		])
		await JobsRun.deleteMany({}, M)
		// A value String() cannot print.
		thrown = Object.create(null)
		await throwing.enqueue()
		await runJobs()
		expect(await rows()).toMatchObject([
			{ state: 'pending', attempts: 1, error: 'An unprintable value.' },
		])
	})

	it('turns failed at once when its job is not declared', async () => {
		await JobsRun.create(
			{
				data: {
					job: 'gone',
					state: 'pending',
					dueAt: new Date(),
					attempts: 0,
				},
			},
			M,
		)
		await runJobs()
		expect(await rows()).toMatchObject([
			{
				state: 'failed',
				attempts: 1,
				error: "The job gone is not in jobsPlugin's jobs.",
			},
		])
	})

	it('is not run by an instance while another holds it', async () => {
		await JobsRun.create(
			{
				data: {
					job: 'flaky',
					state: 'pending',
					dueAt: new Date(),
					attempts: 0,
					lockedUntil: new Date(start.getTime() + minute),
				},
			},
			M,
		)
		await runJobs()
		expect(closed).toStrictEqual([])
		// A lease that ran out is another instance's that stopped.
		vi.setSystemTime(start.getTime() + minute + 1)
		await runJobs()
		expect(closed).toHaveLength(1)
	})
})

describe('runJobs()', () => {
	it('runs during a test of an application with jobsPlugin()', async () => {
		await expect(runJobs()).rejects.toThrow(
			'runJobs() runs during a test of an application with jobsPlugin().',
		)
	})

	it('refuses an enqueue outside a started application', async () => {
		await expect(flaky.enqueue()).rejects.toThrow(
			'flaky.enqueue needs an application with jobsPlugin() started.',
		)
	})
})

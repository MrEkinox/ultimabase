// Recurring jobs (D-221) on `memory()`: one row each, synced at startup; a
// missed occurrence runs once; a failure is logged and the next occurrence
// runs; cron patterns follow their time zone across daylight saving.
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'
import { runJobs, testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, memory } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import type { JobsOptions } from './index.ts'
import { defineJob, jobsPlugin } from './index.ts'
import { JobsRun, M } from './model.ts'
import { schedule } from './runner.ts'
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

const ran: string[] = []
let failing = false
const minute = 60 * 1000
const hourly = defineJob({
	name: 'hourly',
	every: 60 * minute,
	run: () => {
		if (failing) throw new Error('Down.')
		ran.push(new Date().toISOString())
	},
})
const nightly = defineJob({
	name: 'nightly',
	cron: '30 2 * * *',
	timeZone: 'Europe/Paris',
	run: () => {
		ran.push(new Date().toISOString())
	},
})

/** The rows of `JobsRun`, by name. */
const rows = () => JobsRun.findMany({ orderBy: [{ job: 'asc' }] }, M)

const monday = new Date('2027-01-04T08:00:00Z')
/** The clock at the start of each test, which a describe may move. */
let now = monday
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(now)
	ran.length = 0
	lines.length = 0
	failing = false
})
afterEach(() => {
	vi.useRealTimers()
	now = monday
})

describe('a recurring job', () => {
	testApplication(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs: [hourly, nightly] })],
			logger,
		}),
	)

	it('has one row, due at its first occurrence', async () => {
		expect(await rows()).toMatchObject([
			{
				job: 'hourly',
				recurring: 'hourly',
				schedule: 'every 3600000',
				input: null,
				dueAt: new Date('2027-01-04T09:00:00Z'),
				attempts: 0,
			},
			{
				job: 'nightly',
				recurring: 'nightly',
				schedule: 'cron "30 2 * * *" "Europe/Paris"',
				dueAt: new Date('2027-01-05T01:30:00Z'),
			},
		])
	})

	it('runs on its cadence', async () => {
		await runJobs()
		expect(ran).toStrictEqual([])
		vi.setSystemTime(new Date('2027-01-04T09:00:00Z'))
		await runJobs()
		expect(ran).toStrictEqual(['2027-01-04T09:00:00.000Z'])
		const [row] = await rows()
		expect(row?.dueAt).toStrictEqual(new Date('2027-01-04T10:00:00Z'))
	})

	it('runs a missed occurrence once', async () => {
		vi.setSystemTime(new Date('2027-01-04T13:20:00Z'))
		await runJobs()
		expect(ran).toStrictEqual(['2027-01-04T13:20:00.000Z'])
		const [row] = await rows()
		// The next after now, on its cadence from now.
		expect(row?.dueAt).toStrictEqual(new Date('2027-01-04T14:20:00Z'))
	})

	it('logs a failure, and runs its next occurrence', async () => {
		failing = true
		vi.setSystemTime(new Date('2027-01-04T09:00:00Z'))
		await runJobs()
		expect(lines).toStrictEqual([
			{ level: 'error', message: 'The job hourly failed.' },
		])
		const [row] = await rows()
		expect(row).toMatchObject({
			state: 'pending',
			attempts: 0,
			error: 'Down.',
			dueAt: new Date('2027-01-04T10:00:00Z'),
		})
		failing = false
		vi.setSystemTime(new Date('2027-01-04T10:00:00Z'))
		await runJobs()
		expect(await rows()).toMatchObject([{ error: null }, {}])
	})

	it('has its rows synced by instances starting at once (D-352)', async () => {
		const app = runningOf('the test')
		await JobsRun.deleteMany({ where: { job: 'hourly' } }, M)
		const gone = { job: 'gone', recurring: 'gone', state: 'pending' }
		await JobsRun.create(
			{ data: { ...gone, dueAt: new Date(), attempts: 0 } },
			M,
		)
		await Promise.all([schedule(app), schedule(app), schedule(app)])
		expect(await rows()).toMatchObject([{ job: 'hourly' }, { job: 'nightly' }])
		// Any other refusal stops the start.
		const record = app.jobs.get('hourly')
		if (record === undefined) throw new Error('No hourly.')
		const broken = { ...record, name: 'broken', next: () => Number.NaN }
		const jobs = new Map([['broken', broken]])
		await expect(schedule({ ...app, jobs })).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
	})
})

describe('a cron pattern across daylight saving', () => {
	testApplication(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs: [nightly] })],
			logger,
		}),
	)

	describe('spring forward', () => {
		beforeAll(() => {
			// Midnight in Paris, the night clocks go from 2:00 to 3:00.
			now = new Date('2027-03-27T23:00:00Z')
		})

		it('runs a skipped time at the first valid time after the gap', async () => {
			const [row] = await rows()
			expect(row?.dueAt).toStrictEqual(new Date('2027-03-28T01:00:00Z'))
		})
	})

	describe('fall back', () => {
		beforeAll(() => {
			// Midnight in Paris, the night clocks go from 3:00 back to 2:00.
			now = new Date('2027-10-30T22:00:00Z')
		})

		it('runs a repeated time once', async () => {
			const [row] = await rows()
			expect(row?.dueAt).toStrictEqual(new Date('2027-10-31T00:30:00Z'))
			vi.setSystemTime(row?.dueAt ?? 0)
			await runJobs()
			const [next] = await rows()
			// Not 01:30 UTC, the second 2:30 of the night: the next night's.
			expect(next?.dueAt).toStrictEqual(new Date('2027-11-01T01:30:00Z'))
		})
	})
})

describe('the recurring rows at startup', () => {
	it('are created, re-timed when their schedule changed, and deleted when undeclared', async () => {
		const database = kept()
		const runOf = (jobs: JobsOptions['jobs']) => {
			const runs = quietRuns(
				defineApp({
					database,
					models: [],
					plugins: [jobsPlugin({ jobs })],
					logger,
				}),
			)
			if (runs === undefined) throw new Error('No runs.')
			return runs.on(database)
		}
		const first = runOf([hourly, nightly])
		await first.start()
		await first.stop()

		vi.setSystemTime(new Date('2027-01-04T08:30:00Z'))
		const everyHalfHour = defineJob({
			name: 'hourly',
			every: 30 * minute,
			run: () => undefined,
		})
		const weekly = defineJob({
			name: 'weekly',
			cron: '0 9 * * 1',
			run: () => undefined,
		})
		const second = runOf([everyHalfHour, weekly])
		await second.start()
		expect(await rows()).toMatchObject([
			{
				job: 'hourly',
				schedule: 'every 1800000',
				dueAt: new Date('2027-01-04T09:00:00Z'),
			},
			{
				job: 'weekly',
				schedule: 'cron "0 9 * * 1" "UTC"',
				// 4 January 2027 is a Monday.
				dueAt: new Date('2027-01-04T09:00:00Z'),
			},
		])
		await second.stop()

		// The same schedule keeps its due time.
		vi.setSystemTime(new Date('2027-01-04T08:45:00Z'))
		const third = runOf([everyHalfHour, weekly])
		await third.start()
		const [row] = await rows()
		expect(row?.dueAt).toStrictEqual(new Date('2027-01-04T09:00:00Z'))
		// One an older version turned failed is pending again (D-352).
		const failed = { state: 'failed', attempts: 1 }
		await JobsRun.updateMany({ where: { job: 'weekly' }, data: failed }, M)
		await third.stop()
		const fourth = runOf([everyHalfHour, weekly])
		await fourth.start()
		expect(await rows()).toMatchObject([
			{ job: 'hourly', state: 'pending', attempts: 0 },
			{
				job: 'weekly',
				state: 'pending',
				attempts: 0,
				dueAt: new Date('2027-01-04T09:00:00Z'),
			},
		])
		await fourth.stop()
	})
})

describe('the poll', () => {
	it('runs at startup what was due while no instance ran', async () => {
		const database = kept()
		const runs = quietRuns(
			defineApp({
				database: memory(),
				models: [],
				plugins: [jobsPlugin({ jobs: [hourly] })],
				logger,
			}),
		)
		if (runs === undefined) throw new Error('No runs.')
		const first = runs.on(database)
		await first.start()
		await first.stop()
		vi.setSystemTime(new Date('2027-01-04T09:05:00Z'))
		const second = runs.on(database)
		await second.start()
		// The first poll needs no runJobs(); waitFor moves the faked clock.
		await vi.waitFor(() => {
			expect(ran).toHaveLength(1)
		})
		await second.stop()
	})
})

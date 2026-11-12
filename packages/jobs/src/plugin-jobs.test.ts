// Jobs a plugin adds from its `api` (D-369): they run as the application's
// own, a recurring one on its schedule; a name twice, an `add` outside `api`
// and a value that is no job are refused at start.
import { beforeEach, describe, expect, it } from 'vitest'
import { runJobs, testApplication } from '@ultimabase/testing'
import type { Logger, PluginTypes } from 'ultimabase'
import { defineApp, definePlugin, memory } from 'ultimabase'
import { quietRuns } from 'ultimabase/internal'
import type { Jobs, JobsOptions } from './index.ts'
import { defineJob, jobsPlugin } from './index.ts'
import { JobsRun, M } from './model.ts'

const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}

const ran: string[] = []
const syncCustomer = defineJob({
	name: 'billing.syncCustomer',
	run: () => {
		ran.push('billing.syncCustomer')
	},
})
const reconcile = defineJob({
	name: 'billing.reconcile',
	every: 60 * 60 * 1000,
	run: () => {
		ran.push('billing.reconcile')
	},
})

interface Billing extends PluginTypes {
	readonly name: 'billing'
	readonly requires: Jobs
}

/** What billing adds, and whether from its `start` rather than its `api`. */
let adds: unknown = [syncCustomer, reconcile]
let late = false
const billing = definePlugin<Billing>({
	name: 'billing',
	manifest: {
		name: 'test-billing',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { jobs: jobsPlugin },
	api: ({ plugins }) => {
		if (!late) Reflect.apply(plugins.jobs.add, undefined, [adds])
	},
	start: ({ plugins }) => {
		if (late) plugins.jobs.add([syncCustomer])
	},
})

beforeEach(() => {
	ran.length = 0
	adds = [syncCustomer, reconcile]
	late = false
})

describe('the jobs a plugin adds', () => {
	testApplication(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs: [] }), billing.plugin()],
			logger,
		}),
	)

	it('run as the application’s own, a recurring one with its row', async () => {
		const rows = await JobsRun.findMany({}, M)
		expect(rows).toMatchObject([
			{ job: 'billing.reconcile', recurring: 'billing.reconcile' },
		])
		await syncCustomer.enqueue()
		await runJobs()
		expect(ran).toStrictEqual(['billing.syncCustomer'])
	})
})

/** Starts, then stops, an application with billing and `jobs`. */
const started = async (jobs: JobsOptions['jobs'] = []) => {
	const runs = quietRuns(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs }), billing.plugin()],
		}),
	)
	if (runs === undefined) throw new Error('No runs.')
	const running = runs.on(memory())
	await running.start()
	await running.stop()
}

describe('jobs.add', () => {
	it('refuses a name the application took too', async () => {
		await expect(started([syncCustomer])).rejects.toThrow(
			'Two jobs are named billing.syncCustomer.',
		)
	})

	it('runs only in a plugin’s api', async () => {
		late = true
		await expect(started()).rejects.toThrow('jobs.add runs in a plugin’s api.')
	})

	it('refuses a job not in an array', async () => {
		adds = syncCustomer
		await expect(started()).rejects.toThrow(
			'jobs.add’s jobs is an array of defineJob values.',
		)
	})
})

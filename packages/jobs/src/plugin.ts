// `jobsPlugin({ jobs })` (D-221): runs the due rows of `JobsRun`, those
// enqueued here as soon as their write committed, every row every five
// seconds, and each recurring job on its schedule.
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin, Refused } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { JobRecord, Job, RecurringJob } from './define-job.ts'
import { recordOf } from './define-job.ts'
import { JobsRun } from './model.ts'
import {
	close,
	drain,
	open,
	passes,
	schedule,
	settled,
	start,
} from './runner.ts'
import type { Running } from './state.ts'
import { runningOf, useRunning } from './state.ts'

type AnyJob = Job<string, never> | RecurringJob<string>

/** What `jobsPlugin` takes. */
export interface JobsOptions {
	readonly jobs: readonly AnyJob[]
}

/** What the jobs plugin offers other plugins, and `runJobs()`. */
export interface JobsApi {
	/** Runs the due rows, and those their runs enqueue, until none is due. */
	readonly drain: () => Promise<void>
	/** Adds a plugin's jobs, from its `api` (D-369). */
	readonly add: (jobs: readonly AnyJob[]) => void
}

/** The jobs plugin's types (D-57). */
export interface Jobs extends PluginTypes {
	readonly name: 'jobs'
	readonly appOptions: JobsOptions
	readonly api: JobsApi
}

/** Five seconds, between two looks for due rows. */
const pollEvery = 5000

/** The `defineJob` values in `jobs`; refuses any other, naming `where`. */
function recordsOf(jobs: unknown, where: string): readonly JobRecord[] {
	const records = Array.isArray(jobs) ? jobs.map(recordOf) : [undefined]
	return records.map((record) => {
		if (record !== undefined) return record
		throw new Refused(`${where} is an array of defineJob values.`)
	})
}

/** The jobs by name; refuses a name twice. */
function jobsOf(records: readonly JobRecord[]): ReadonlyMap<string, JobRecord> {
	const byName = new Map<string, JobRecord>()
	for (const record of records) {
		if (byName.has(record.name)) {
			throw new Refused(`Two jobs are named ${record.name}.`)
		}
		byName.set(record.name, record)
	}
	return byName
}

// The jobs plugins add from their `api`, until jobsPlugin starts (D-369).
const added: JobRecord[] = []
let adding = false

// The poll's timer, while the application runs.
let timer: NodeJS.Timeout | undefined
let polling = false

/** One look for due rows, unless the last one still runs. */
async function poll(app: Running): Promise<void> {
	if (polling) return
	polling = true
	try {
		await passes(app)
	} catch (error) {
		app.logger.warn({ err: error }, 'The jobs could not be read.')
	} finally {
		polling = false
	}
}

const definition = definePlugin<Jobs>({
	name: 'jobs',
	manifest,
	models: [JobsRun],
	api: () => {
		added.length = 0
		adding = true
		return {
			drain: () => drain(runningOf('runJobs()')),
			add: (jobs) => {
				if (!adding) {
					throw new Refused('jobs.add runs in a plugin’s api.')
				}
				added.push(...recordsOf(jobs, 'jobs.add’s jobs'))
			},
		}
	},
	start: async ({ options, logger }) => {
		const own = recordsOf(options.jobs, 'jobsPlugin’s jobs')
		const app: Running = {
			jobs: jobsOf([...own, ...added]),
			logger,
			kick: (row) => void start(app, row),
		}
		adding = false
		useRunning(app)
		open()
		await schedule(app)
	},
	// What was due while no instance ran runs once now.
	started: () => {
		const app = runningOf('jobsPlugin')
		void poll(app)
		timer = setInterval(() => void poll(app), pollEvery)
		timer.unref()
	},
	stopping: async () => {
		clearInterval(timer)
		timer = undefined
		close()
		await settled()
	},
	stop: () => {
		useRunning(undefined)
	},
})

/** Jobs: runs enqueued with a write, delayed or on a schedule (D-221). */
export const jobsPlugin: PluginOf<Jobs> = definition.plugin

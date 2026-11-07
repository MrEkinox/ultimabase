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

/** What `jobsPlugin` takes. */
export interface JobsOptions {
	readonly jobs: readonly (Job<string, never> | RecurringJob<string>)[]
}

/** What the jobs plugin offers other plugins, and `runJobs()`. */
export interface JobsApi {
	/** Runs the due rows, and those their runs enqueue, until none is due. */
	readonly drain: () => Promise<void>
}

/** The jobs plugin's types (D-57). */
export interface Jobs extends PluginTypes {
	readonly name: 'jobs'
	readonly appOptions: JobsOptions
	readonly api: JobsApi
}

/** Five seconds, between two looks for due rows. */
const pollEvery = 5000

/** The jobs by name; refuses a value `defineJob` did not return and a name twice. */
function jobsOf(jobs: unknown): ReadonlyMap<string, JobRecord> {
	if (!Array.isArray(jobs)) {
		throw new Refused('jobsPlugin’s jobs is an array of defineJob values.')
	}
	const byName = new Map<string, JobRecord>()
	for (const job of jobs) {
		const record = recordOf(job)
		if (record === undefined) {
			throw new Refused('jobsPlugin’s jobs is an array of defineJob values.')
		}
		if (byName.has(record.name)) {
			throw new Refused(`jobsPlugin’s jobs name ${record.name} twice.`)
		}
		byName.set(record.name, record)
	}
	return byName
}

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
	api: () => ({ drain: () => drain(runningOf('runJobs()')) }),
	start: async ({ options, logger }) => {
		const app: Running = {
			jobs: jobsOf(options.jobs),
			logger,
			kick: (id) => void start(app, id),
		}
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

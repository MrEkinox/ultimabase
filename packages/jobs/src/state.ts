// The running plugin's state (D-221): its jobs by name, its logger, and how
// it starts a run once the write that enqueued it committed.
import type { Logger } from 'ultimabase'
import type { JobRecord } from './define-job.ts'

export interface Running {
	readonly jobs: ReadonlyMap<string, JobRecord>
	readonly logger: Logger
	/** Runs the row `id` now, in this instance. */
	readonly kick: (id: string) => void
}

let running: Running | undefined

export function useRunning(value: Running | undefined): void {
	running = value
}

/** The running plugin's state; `what` names the call that needs it. */
export function runningOf(what: string): Running {
	if (running === undefined) {
		throw new Error(`${what} needs an application with jobsPlugin() started.`)
	}
	return running
}

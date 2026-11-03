// Runs the due rows (D-221). An instance holds a row through its lease, set
// by an update that only one instance counts; a run that fails waits twice as
// long each time, up to ten attempts.
import type { RecordOf } from 'ultimabase'
import type { JobRecord } from './define-job.ts'
import { JobsRun, M } from './model.ts'
import type { Running } from './state.ts'

/** Five minutes, an instance's hold on a row. */
export const lease: number = 5 * 60 * 1000
/** The attempts of a run before it turns `failed`. */
export const attempts = 10
/** Ten seconds, the wait after a first failure. */
export const backoff: number = 10 * 1000
/** The rows a pass runs at once. */
const batch = 20

type Row = RecordOf<typeof JobsRun>

/** The rows due at `now` that no instance holds. */
function due(now: Date) {
	return {
		state: 'pending',
		dueAt: { lte: now },
		OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
	}
}

/** Whether this instance now holds the row: one update counts it. */
async function claim(id: string, now: number): Promise<boolean> {
	const { count } = await JobsRun.updateMany(
		{
			where: { AND: [{ id }, due(new Date(now))] },
			data: { lockedUntil: new Date(now + lease) },
		},
		M,
	)
	return count === 1
}

/** The first due time of a recurring job after `now`, on its cadence. */
function following(job: JobRecord, row: Row, now: number): Date {
	let next = job.next(row.dueAt.getTime())
	// Missed occurrences run once: the next is the first after now.
	if (next <= now) next = job.next(now)
	return new Date(next)
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function failed(
	app: Running,
	row: Row,
	job: JobRecord | undefined,
	error: unknown,
	now: number,
): Promise<void> {
	const message = messageOf(error)
	const facts = { err: error, job: row.job, run: row.id }
	if (job?.schedule !== undefined && row.recurring !== null) {
		app.logger.error(facts, `The job ${row.job} failed.`)
		const dueAt = following(job, row, now)
		const data = { dueAt, lockedUntil: null, error: message }
		await JobsRun.update({ where: { id: row.id }, data }, M)
		return
	}
	const tried = row.attempts + 1
	const last = job === undefined || tried >= attempts
	if (last) {
		app.logger.error(facts, `The job ${row.job} failed: its run is kept.`)
	} else {
		app.logger.warn(facts, `The job ${row.job} failed: it runs again.`)
	}
	const data = {
		attempts: tried,
		lockedUntil: null,
		error: message,
		...(last
			? { state: 'failed' }
			: { dueAt: new Date(now + backoff * 2 ** (tried - 1)) }),
	}
	await JobsRun.update({ where: { id: row.id }, data }, M)
}

/** Runs the row once this instance holds it; whether it did. */
async function runRow(app: Running, id: string): Promise<boolean> {
	const now = Date.now()
	if (!(await claim(id, now))) return false
	const row = await JobsRun.findUnique({ where: { id } }, M)
	if (row === null) return false
	const job = app.jobs.get(row.job)
	if (job === undefined) {
		const error = new Error(`The job ${row.job} is not in jobsPlugin's jobs.`)
		await failed(app, row, job, error, now)
		return true
	}
	try {
		await job.run(job.input === undefined ? { id } : { id, input: row.input })
	} catch (error) {
		await failed(app, row, job, error, now)
		return true
	}
	if (row.recurring === null) {
		await JobsRun.delete({ where: { id } }, M)
	} else {
		const data = {
			dueAt: following(job, row, now),
			attempts: 0,
			lockedUntil: null,
			error: null,
		}
		await JobsRun.update({ where: { id }, data }, M)
	}
	return true
}

/** The runs this instance has started and not finished. */
const running = new Set<Promise<unknown>>()

/** Starts the row's run; a failure outside the job is logged. */
export function start(app: Running, id: string): Promise<boolean> {
	const run = runRow(app, id).catch((error: unknown) => {
		app.logger.error({ err: error, run: id }, 'A job could not run.')
		return false
	})
	running.add(run)
	void run.finally(() => running.delete(run))
	return run
}

/** Runs the rows due now, a batch at a time; how many it ran. */
export async function pass(app: Running): Promise<number> {
	const rows = await JobsRun.findMany(
		{
			where: due(new Date()),
			orderBy: [{ dueAt: 'asc' }],
			take: batch,
			select: { id: true },
		},
		M,
	)
	const ran = await Promise.all(rows.map((row) => start(app, row.id)))
	return ran.filter(Boolean).length
}

/** Waits for the runs this instance started. */
export async function settled(): Promise<void> {
	await Promise.all(running)
}

/**
 * Runs the due rows, and those their runs enqueue, until none is due:
 * what `runJobs()` does.
 */
export async function drain(app: Running): Promise<void> {
	for (let passes = 0; passes < 100; passes++) {
		await settled()
		if ((await pass(app)) === 0 && running.size === 0) return
	}
	throw new Error(
		'runJobs stopped after 100 passes: a job enqueues a run due at once each time it runs.',
	)
}

/** Creates the rows of new recurring jobs, and deletes those of old ones. */
export async function schedule(app: Running): Promise<void> {
	const now = Date.now()
	const rows = await JobsRun.findMany(
		{ where: { recurring: { not: null } } },
		M,
	)
	for (const row of rows) {
		const job = app.jobs.get(row.recurring ?? '')
		if (job?.schedule === undefined) {
			await JobsRun.delete({ where: { id: row.id } }, M)
		} else if (job.schedule !== row.schedule) {
			const data = { schedule: job.schedule, dueAt: new Date(job.next(now)) }
			await JobsRun.update({ where: { id: row.id }, data }, M)
		}
	}
	const known = new Set(rows.map((row) => row.recurring))
	for (const job of app.jobs.values()) {
		if (job.schedule === undefined || known.has(job.name)) continue
		const create = {
			job: job.name,
			recurring: job.name,
			schedule: job.schedule,
			state: 'pending',
			dueAt: new Date(job.next(now)),
			attempts: 0,
		}
		// Another instance starting at once may have created it.
		await JobsRun.upsert(
			{ where: { recurring: job.name }, create, update: {} },
			M,
		)
	}
}

// Runs the due rows (D-221). An instance holds a row through its lease, set
// by an update that only one instance counts; a run that fails waits twice as
// long each time, up to ten attempts.
import type { RecordOf } from 'ultimabase'
import { PublicError } from 'ultimabase'
import { appLogger, logFailure } from 'ultimabase/internal'
import type { JobRecord } from './define-job.ts'
import { JobsRun, M } from './model.ts'
import type { Running } from './state.ts'

/** Five minutes, an instance's hold on a row. */
export const lease: number = 5 * 60 * 1000
/** The attempts of a run before it turns `failed`. */
export const attempts = 10
/** Ten seconds, the wait after a first failure. */
export const backoff: number = 10 * 1000
/** The runs an instance runs at once, started at a commit or found (D-302). */
const atOnce = 20

type Row = RecordOf<typeof JobsRun>

/** The rows due at `now` that no instance holds, of the jobs it declares. */
function due(app: Running, now: Date) {
	return {
		job: { in: [...app.jobs.keys()] },
		state: 'pending',
		dueAt: { lte: now },
		OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
	}
}

/** The row, once this instance holds it until `held`: one update returns it. */
async function claim(app: Running, id: string, now: number, held: Date) {
	const [row] = await JobsRun.updateManyAndReturn(
		{
			where: { AND: [{ id }, due(app, new Date(now))] },
			data: { lockedUntil: held },
		},
		M,
	)
	return row
}

/** The first due time of a recurring job after `now`, on its cadence. */
function following(job: JobRecord, row: Row, now: number): Date {
	let next = job.next(row.dueAt.getTime())
	// Missed occurrences run once: the next is the first after now.
	if (next <= now) next = job.next(now)
	return new Date(next)
}

/** An error's message as the database stores it: no NUL, no lone surrogate. */
function messageOf(error: unknown): string {
	try {
		const message = error instanceof Error ? error.message : String(error)
		return message.replaceAll('\0', '').toWellFormed()
	} catch {
		return 'An unprintable value.'
	}
}

/** What a failed run writes to its row. */
function failed(
	app: Running,
	row: Row,
	job: JobRecord,
	error: unknown,
	now: number,
) {
	const message = messageOf(error)
	const facts = { job: row.job, run: row.id }
	if (job.schedule !== undefined && row.recurring !== null) {
		logFailure(app.logger, error, `The job ${row.job} failed.`, facts)
		const dueAt = following(job, row, now)
		return { dueAt, lockedUntil: null, error: message }
	}
	const tried = row.attempts + 1
	const last = tried >= attempts
	if (last) {
		logFailure(
			app.logger,
			error,
			`The job ${row.job} failed: its run is kept.`,
			facts,
		)
	} else {
		app.logger.warn(
			{ ...facts, err: error },
			`The job ${row.job} failed: it runs again.`,
		)
	}
	return {
		attempts: tried,
		lockedUntil: null,
		error: message,
		...(last
			? { state: 'failed' }
			: { dueAt: new Date(now + backoff * 2 ** (tried - 1)) }),
	}
}

/** What a run writes to its row: its failure, its next time, or none. */
async function ran(app: Running, row: Row, job: JobRecord, now: number) {
	const { id, input } = row
	const logger = appLogger().child({ job: row.job, run: id })
	try {
		await job.run(
			job.input === undefined ? { id, logger } : { id, input, logger },
		)
	} catch (error) {
		return failed(app, row, job, error, now)
	}
	if (row.recurring === null) return undefined
	const dueAt = following(job, row, now)
	return { dueAt, attempts: 0, lockedUntil: null, error: null }
}

/** Runs the row once this instance holds it; whether it did. */
async function runRow(app: Running, id: string): Promise<boolean> {
	const now = Date.now()
	const held = new Date(now + lease)
	const row = await claim(app, id, now, held)
	// A claimed row's job is one this instance declares.
	const job = app.jobs.get(row?.job ?? '')
	if (row === undefined || job === undefined) return false
	const data = await ran(app, row, job, now)
	// Only while this instance holds the row: another took it over after.
	const where = { id, lockedUntil: held }
	const { count } =
		data === undefined
			? await JobsRun.deleteMany({ where }, M)
			: await JobsRun.updateMany({ where, data }, M)
	if (count === 0) {
		const facts = { job: row.job, run: id }
		const message = `The job ${row.job} outlived its lease: another instance took it over.`
		app.logger.warn(facts, message)
	}
	return true
}

/** The runs this instance has started and not finished. */
const running = new Set<Promise<unknown>>()

// The runs that hold one of the `atOnce` places (D-302), those waiting for
// one in the order they started, and the passes waiting for room.
let active = 0
let closed = false
const waiting: ((admitted: boolean) => void)[] = []
const roomy: (() => void)[] = []

/** A place for a run, or false once the instance stops. */
function admit(): Promise<boolean> {
	if (closed) return Promise.resolve(false)
	if (active < atOnce && waiting.length === 0) {
		active += 1
		return Promise.resolve(true)
	}
	return new Promise((resolve) => waiting.push(resolve))
}

/** Gives a run's place to the oldest waiting one, or makes room. */
function free(): void {
	const next = waiting.shift()
	if (next !== undefined) {
		next(true)
		return
	}
	active -= 1
	for (const resolve of roomy.splice(0)) resolve()
}

/** Once no run waits for a place and one is free, or the instance stops. */
function room(): Promise<void> {
	if (closed || (active < atOnce && waiting.length === 0)) {
		return Promise.resolve()
	}
	return new Promise((resolve) => roomy.push(resolve))
}

/** Lets runs start again, when the plugin starts. */
export function open(): void {
	closed = false
}

/** Drops the runs waiting for a place: their rows stay due for any instance. */
export function close(): void {
	closed = true
	for (const resolve of waiting.splice(0)) resolve(false)
	for (const resolve of roomy.splice(0)) resolve()
}

/** Starts the row's run once it has a place; a failure outside the job is logged. */
export function start(app: Running, id: string): Promise<boolean> {
	const run = admit()
		.then(async (admitted) => {
			if (!admitted) return false
			try {
				return await runRow(app, id)
			} finally {
				free()
			}
		})
		.catch((error: unknown) => {
			failure ??= { error }
			logFailure(app.logger, error, 'A job could not run.', { run: id })
			return false
		})
	running.add(run)
	void run.finally(() => running.delete(run))
	return run
}

/** The first failure of a run outside its job, as when the database is down. */
let failure: { readonly error: unknown } | undefined

/**
 * Starts the rows due now once the runs before them all have a place, so
 * that a slow run holds only its own; whether it found any.
 */
async function pass(app: Running): Promise<boolean> {
	await room()
	if (closed || failure !== undefined) return false
	const rows = await JobsRun.findMany(
		{
			where: due(app, new Date()),
			orderBy: [{ dueAt: 'asc' }],
			take: atOnce,
			select: { id: true },
		},
		M,
	)
	for (const row of rows) void start(app, row.id)
	return rows.length > 0
}

/** Starts the due rows until none is, or until a run fails outside its job. */
export async function passes(app: Running): Promise<void> {
	failure = undefined
	while (await pass(app));
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
	failure = undefined
	for (let rounds = 0; rounds < 100; rounds++) {
		await settled()
		const found = await pass(app)
		if (failure !== undefined) {
			const { error } = failure
			throw new Error('runJobs could not run a job.', { cause: error })
		}
		if (!found && running.size === 0) return
	}
	throw new Error(
		'runJobs stopped after 100 passes: a job enqueues a run due at once each time it runs.',
	)
}

/** Creates, re-times, sets pending again and deletes the recurring rows. */
export async function schedule(app: Running): Promise<void> {
	const now = Date.now()
	const rows = await JobsRun.findMany(
		{ where: { recurring: { not: null } } },
		M,
	)
	for (const row of rows) {
		const job = app.jobs.get(row.recurring ?? '')
		if (job?.schedule === undefined) {
			// Another instance starting at once may have deleted it.
			await JobsRun.deleteMany({ where: { id: row.id } }, M)
		} else if (job.schedule !== row.schedule || row.state !== 'pending') {
			const { schedule: given } = job
			const dueAt = new Date(job.next(now))
			const data = { schedule: given, state: 'pending', attempts: 0, dueAt }
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
		await JobsRun.create({ data: create }, M).catch((error: unknown) => {
			// Another instance starting at once may have created it.
			const taken =
				error instanceof PublicError && error.code === 'UNIQUE_VIOLATION'
			if (!taken) throw error
		})
	}
}

// `defineJob` (D-221): a job takes an input, or runs `every` milliseconds,
// or on a `cron` pattern. A job with no schedule is enqueued, from its
// definition, in the current transaction (D-36).
import { Cron } from 'croner'
import { PublicError, Refused } from 'ultimabase'
import { checked, standardOf } from 'ultimabase/internal'
import { JobsRun, M } from './model.ts'
import { runningOf } from './state.ts'

/**
 * Standard Schema (standardschema.dev), the part a job reads. Its
 * specification asks for the interface to be copied, not imported.
 */
export interface StandardSchema<I = unknown, O = I> {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => unknown
		readonly types?: { readonly input: I; readonly output: O } | undefined
	}
}

type Types<S> =
	S extends StandardSchema<infer I, infer O>
		? { readonly input: I; readonly output: O }
		: never

/** What a job's `run` returns, which nothing reads. */
type Done = unknown

/** The id of the run's row, the key that makes its effect idempotent. */
type Facts = { readonly id: string }

type Schedule = {
	readonly input?: never
	readonly every?: never
	readonly cron?: never
	readonly timeZone?: never
}

type InputDefinition<N, S> = Omit<Schedule, 'input'> & {
	readonly name: N
	/** Validated when the run is enqueued, and stored as JSON. */
	readonly input: S
	readonly run: (facts: Facts & { readonly input: Types<S>['output'] }) => Done
}

type PlainDefinition<N> = Schedule & {
	readonly name: N
	readonly run: (facts: Facts) => Done
}

type EveryDefinition<N> = Omit<Schedule, 'every'> & {
	readonly name: N
	/** In milliseconds. */
	readonly every: number
	readonly run: (facts: Facts) => Done
}

type CronDefinition<N> = Omit<Schedule, 'cron' | 'timeZone'> & {
	readonly name: N
	/** Five fields: minute, hour, day of the month, month, day of the week. */
	readonly cron: string
	/** An IANA time zone, such as `'Europe/Paris'`: `'UTC'` by default. */
	readonly timeZone?: string
	readonly run: (facts: Facts) => Done
}

/** `enqueue`'s options. */
export interface EnqueueOptions {
	/** In milliseconds, how long the run waits. */
	readonly after?: number
}

/** A job enqueued from server code. */
export interface Job<N extends string, I> {
	readonly name: N
	/**
	 * Writes a run in the current transaction, or alone outside one: it
	 * exists if and only if the transaction commits.
	 */
	readonly enqueue: (
		...args: [I] extends [never]
			? [options?: EnqueueOptions]
			: [input: I, options?: EnqueueOptions]
	) => Promise<void>
}

/** A job that runs on its schedule, never enqueued. */
export interface RecurringJob<N extends string> {
	readonly name: N
}

/** What the plugin reads of a job. */
export interface JobRecord {
	readonly name: string
	readonly input: StandardSchema | undefined
	/** `every <ms>` or `cron <pattern> <zone>`, for a recurring job. */
	readonly schedule: string | undefined
	/** The first due time after `from`, for a recurring job. */
	readonly next: (from: number) => number
	readonly run: (facts: Facts & { readonly input?: unknown }) => Done
}

const records = new WeakMap<object, JobRecord>()

/** A `defineJob` value's record. */
export function recordOf(job: unknown): JobRecord | undefined {
	return typeof job === 'object' && job !== null ? records.get(job) : undefined
}

/** A positive number of milliseconds. */
function isDuration(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** The next due time of a pattern croner accepts; refuses one it does not. */
function cronNext(
	name: string,
	pattern: unknown,
	zone: unknown,
): (from: number) => number {
	if (typeof pattern !== 'string') {
		throw new Refused(`${name}: cron is a pattern of five fields.`)
	}
	if (zone !== undefined && typeof zone !== 'string') {
		throw new Refused(`${name}: timeZone is an IANA time zone.`)
	}
	let cron: Cron
	try {
		cron = new Cron(pattern, { timezone: zone ?? 'UTC', mode: '5-part' })
		cron.nextRun()
	} catch (error) {
		throw new Refused(`${name}: ${String(error)}`, { cause: error })
	}
	return (from) => {
		const next = cron.nextRun(new Date(from))
		if (next === null) throw new Error(`${name}: cron has no next time.`)
		return next.getTime()
	}
}

/** The record of a job's definition, checked at import. */
function recordFor(definition: object): JobRecord {
	const read = (key: string): unknown => Reflect.get(definition, key)
	const [name, input, every, cron, timeZone, run] = [
		'name',
		'input',
		'every',
		'cron',
		'timeZone',
		'run',
	].map(read)
	if (typeof name !== 'string' || name === '') {
		throw new Refused('defineJob: name is a non-empty string.')
	}
	if (typeof run !== 'function')
		throw new Refused(`${name}: run is a function.`)
	const forms = [input, every, cron].filter((form) => form !== undefined)
	if (forms.length > 1) {
		throw new Refused(`${name}: a job takes one of input, every and cron.`)
	}
	if (timeZone !== undefined && cron === undefined) {
		throw new Refused(`${name}: timeZone goes with cron.`)
	}
	if (input !== undefined && standardOf(input) === undefined) {
		throw new Refused(`${name}: input is a Standard Schema.`)
	}
	if (every !== undefined && !isDuration(every)) {
		throw new Refused(`${name}: every is a positive number of milliseconds.`)
	}
	const next =
		cron !== undefined
			? cronNext(name, cron, timeZone)
			: (from: number) => from + Number(every)
	// cronNext refused a pattern or a zone that is no string.
	const schedule =
		cron !== undefined
			? `cron ${JSON.stringify(cron)} ${JSON.stringify(timeZone ?? 'UTC')}`
			: every === undefined
				? undefined
				: `every ${every}`
	const runs = (facts: Facts & { readonly input?: unknown }): Done =>
		Reflect.apply(run, undefined, [facts])
	const schema = standardOf(input)?.schema
	return { name, input: schema, schedule, next, run: runs }
}

/** The input's validated value; refuses it as `VALIDATION_FAILED`. */
async function validated(name: string, schema: StandardSchema, input: unknown) {
	const standard = standardOf(schema)
	if (standard === undefined) return input
	const result = await checked(standard, input, [], name)
	if ('issues' in result) {
		throw new PublicError('VALIDATION_FAILED', 'Invalid input.', {
			details: { issues: result.issues },
		})
	}
	return result.value
}

async function enqueue(record: JobRecord, args: readonly unknown[]) {
	const { name, input: schema } = record
	const [input, options] =
		schema === undefined ? [undefined, args[0]] : [args[0], args[1]]
	const after: unknown =
		typeof options === 'object' && options !== null
			? Reflect.get(options, 'after')
			: undefined
	if (after !== undefined && !isDuration(after)) {
		throw new TypeError(`${name}: after is a positive number of milliseconds.`)
	}
	if (runningOf(`${name}.enqueue`).jobs.get(name) !== record) {
		throw new Error(`${name} is not in jobsPlugin's jobs.`)
	}
	const value =
		schema === undefined ? null : await validated(name, schema, input)
	// Stored as JSON: a date as its ISO string, an undefined key left out.
	const json: unknown = JSON.parse(JSON.stringify(value ?? null))
	const data = {
		job: name,
		input: json,
		state: 'pending',
		dueAt: new Date(Date.now() + (after ?? 0)),
		attempts: 0,
	}
	await JobsRun.create({ data }, M)
}

export function defineJob<
	const N extends string,
	const S extends StandardSchema,
>(definition: InputDefinition<N, S>): Job<N, Types<S>['input']>
export function defineJob<const N extends string>(
	definition: PlainDefinition<N>,
): Job<N, never>
export function defineJob<const N extends string>(
	definition: EveryDefinition<N> | CronDefinition<N>,
): RecurringJob<N>
export function defineJob(definition: {
	readonly name: string
}): Job<string, unknown> | RecurringJob<string> {
	const record = recordFor(definition)
	const job = Object.freeze(
		record.schedule === undefined
			? {
					name: record.name,
					enqueue: async (...args: unknown[]) => enqueue(record, args),
				}
			: { name: record.name },
	)
	records.set(job, record)
	return job
}

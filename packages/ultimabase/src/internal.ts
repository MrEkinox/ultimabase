// What official packages read from an application (D-130), kept off the
// documented surface: new runs of it on another database, quieter, the
// running plugins' APIs, what raw SQL and tests on the declared database
// need (D-137), what live reads need (D-154), the feed tests call (D-168),
// the pages functions return (D-182), the reset route (D-188) and the
// master key's header the rate limit checks (D-218) and the Standard Schema
// check a job's input takes (D-221) and the deepest filter (D-228).
import type { Adapter, Feed } from './adapter.ts'
import { internalsOf } from './app-internals.ts'
import type { Logger } from './app-options.ts'
import { consoleLogger } from './console-logger.ts'
import type { Lifecycle } from './lifecycle.ts'
import { lifecycle } from './lifecycle.ts'
import { current } from './running.ts'

export type { Lifecycle }
export type { Scratch } from './scratch.ts'
export { scratchable, scratchOf } from './scratch.ts'
export { isRow } from './field-codec.ts'
export type { PageSource } from './page.ts'
export { pageSource } from './page.ts'
export { joining } from './transaction.ts'
export { masterKeyHeader } from './identify.ts'
export { issueOf } from './write-data.ts'
export { decimalPattern } from './decimal.ts'
export { checked, standardOf } from './validation.ts'
export type { Recorded } from './recorder.ts'
export { recording, recordingRuns, recordingVirtuals } from './recorder.ts'
export { required, SharedReads } from './live-shared.ts'
export type { Judge, LivePlan, LiveReader } from './live.ts'
export {
	afterKeys,
	inMemory,
	liveSchema,
	livePlan,
	liveReader,
	matches,
	sortKeys,
	storedRows,
} from './live.ts'
export { compareKeys } from './memory-values.ts'
export { maxFilterDepth } from './query-where.ts'
export { maxWriteDepth } from './write-data.ts'

/** `logger` without its info lines. */
function quieted(logger: Logger): Logger {
	return {
		info: () => undefined,
		warn: logger.warn.bind(logger),
		error: logger.error.bind(logger),
		child: (bindings) => quieted(logger.child(bindings)),
	}
}

/** The application's database, and new runs of it on another (D-130). */
export type QuietRuns = {
	readonly declared: Adapter
	/** A run on `database`, without info lines. */
	readonly on: (database: Adapter) => Lifecycle
}

/**
 * Runs of the application `defineApp` returned as `app`, or `undefined` for
 * another value.
 */
export function quietRuns(app: unknown): QuietRuns | undefined {
	const options = internalsOf(app)?.options
	if (options === undefined) return undefined
	const logger = quieted(options.logger ?? consoleLogger())
	return {
		declared: options.database,
		on: (database) => lifecycle({ ...options, database, logger }),
	}
}

/** The running application's change feed, if a plugin takes it (D-168). */
export function runningFeed(): Feed | undefined {
	return current()?.feed
}

/** The running application's plugin API named `name`, if any. */
export function runningApi(name: string): unknown {
	return current()?.apis.get(name)
}

/**
 * Empties the running application's database once its running operations
 * are over, new ones held until then, then has its live reads read again
 * (D-188).
 */
export async function emptyRunning(): Promise<void> {
	const app = current()
	if (app === undefined) throw new Error('No application is running.')
	await app.work.alone(5000, async () => app.adapter.empty())
	app.feed?.missed()
}

// What official packages read from an application (D-130), kept off the
// documented surface: new runs of it on another database, quieter, the
// running plugins' APIs, what raw SQL and tests on the declared database
// need (D-137), and what live reads need (D-154).
import type { Adapter } from './adapter.ts'
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
export { joining } from './transaction.ts'
export { issueOf } from './write-data.ts'
export { decimalPattern } from './decimal.ts'
export type { Recorded } from './recorder.ts'
export { recording } from './recorder.ts'
export type { LivePlan } from './live.ts'
export {
	inMemory,
	liveSchema,
	livePlan,
	matches,
	servedRows,
	sortKeys,
	storedRows,
} from './live.ts'
export { compareKeys } from './memory-values.ts'

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

/** The running application's plugin API named `name`, if any. */
export function runningApi(name: string): unknown {
	return current()?.apis.get(name)
}

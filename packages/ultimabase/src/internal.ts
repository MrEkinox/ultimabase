// What official packages read from an application (D-130), kept off the
// documented surface: new runs of it on another database, quieter, and the
// running plugins' APIs.
import type { Adapter } from './adapter.ts'
import { internalsOf } from './app-internals.ts'
import type { Logger } from './app-options.ts'
import { consoleLogger } from './console-logger.ts'
import type { Lifecycle } from './lifecycle.ts'
import { lifecycle } from './lifecycle.ts'
import { current } from './running.ts'

export type { Lifecycle }

/** `logger` without its info lines. */
function quieted(logger: Logger): Logger {
	return {
		info: () => undefined,
		warn: logger.warn.bind(logger),
		error: logger.error.bind(logger),
		child: (bindings) => quieted(logger.child(bindings)),
	}
}

/**
 * Runs of the application `defineApp` returned as `app`, each on its own
 * database and without info lines, or `undefined` for another value.
 */
export function quietRuns(
	app: unknown,
): ((database: Adapter) => Lifecycle) | undefined {
	const options = internalsOf(app)?.options
	if (options === undefined) return undefined
	const logger = quieted(options.logger ?? consoleLogger())
	return (database) => lifecycle({ ...options, database, logger })
}

/** The running application's plugin API named `name`, if any. */
export function runningApi(name: string): unknown {
	return current()?.apis.get(name)
}

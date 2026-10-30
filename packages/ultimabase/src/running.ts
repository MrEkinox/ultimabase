// The running application (D-18): its resolved models and functions, its
// adapter, its logger, its plugins' APIs (D-89) and the operations `stop`
// waits for (D-91), one per realm.
import type { Adapter, Feed } from './adapter.ts'
import type { Logger } from './app-options.ts'
import type { Complete } from './complete.ts'
import type { FunctionDefinition } from './definition.ts'
import type { Resolved } from './schema.ts'

export type Running = {
	readonly resolved: Resolved
	/** Its functions, by their `defineFunction` value (D-75). */
	readonly functions: ReadonlyMap<object, FunctionDefinition>
	readonly adapter: Adapter
	/** What it gives the adapter, `undefined` when no plugin takes it (D-154). */
	readonly feed: Feed | undefined
	readonly logger: Logger
	/** Each plugin's API, by its name (D-16). */
	readonly apis: ReadonlyMap<string, unknown>
	readonly work: Work
	/** Completes a user caller with its plugins' keys (D-121). */
	readonly complete: Complete
}

/** The operations running, `*Commit` hooks included, that `stop` waits for. */
export class Work {
	private count = 0
	private readonly idle: (() => void)[] = []

	async run<R>(run: () => Promise<R>): Promise<R> {
		this.count += 1
		try {
			return await run()
		} finally {
			this.count -= 1
			if (this.count === 0) for (const done of this.idle.splice(0)) done()
		}
	}

	async settled(): Promise<void> {
		if (this.count === 0) return
		await new Promise<void>((done) => {
			this.idle.push(done)
		})
	}
}

let running: Running | undefined

export function register(app: Running): void {
	if (running !== undefined) {
		throw new Error('An application is already running; stop it first.')
	}
	running = app
}

export function unregister(app: Running): void {
	if (running === app) running = undefined
}

/** The running application, `undefined` before `start`. */
export function current(): Running | undefined {
	return running
}

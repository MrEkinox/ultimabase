// The running application (D-18): its resolved models, its adapter and its
// logger, one per realm.
import type { Adapter } from './adapter.ts'
import type { Logger } from './app-options.ts'
import type { Resolved } from './schema.ts'

export type Running = {
	readonly resolved: Resolved
	readonly adapter: Adapter
	readonly logger: Logger
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

// The running application (D-18): its resolved models and functions, its
// adapter, its logger, its plugins' APIs (D-89) and the operations `stop`
// waits for (D-91), one per realm.
import { AsyncLocalStorage } from 'node:async_hooks'
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

/**
 * The operations running, `*Commit` hooks included, that `stop` waits for,
 * and the one that runs alone (D-188).
 */
export class Work {
	private count = 0
	private readonly idle: (() => void)[] = []
	/** Settles once the operation running alone is over. */
	private held: Promise<void> | undefined
	/** Set inside an operation: what it starts is part of it, never held. */
	private readonly inside = new AsyncLocalStorage<true>()

	async run<R>(run: () => Promise<R>): Promise<R> {
		if (this.inside.getStore() === undefined) {
			while (this.held !== undefined) await this.held
		}
		return this.counted(run)
	}

	/**
	 * Runs `run` once the running operations are over, holding new ones
	 * until it is; fails when they still run after `limit` milliseconds.
	 */
	async alone<R>(limit: number, run: () => Promise<R>): Promise<R> {
		while (this.held !== undefined) await this.held
		const { promise, resolve } = Promise.withResolvers<void>()
		this.held = promise
		const late = Promise.withResolvers<never>()
		const timer = setTimeout(() => {
			const message = `${this.count} operations still ran after ${limit / 1000} s; nothing was emptied.`
			late.reject(new Error(message))
		}, limit)
		try {
			await Promise.race([this.settled(), late.promise]).finally(() => {
				clearTimeout(timer)
			})
			return await this.counted(run)
		} finally {
			this.held = undefined
			resolve()
		}
	}

	private async counted<R>(run: () => Promise<R>): Promise<R> {
		this.count += 1
		try {
			return await this.inside.run(true, run)
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

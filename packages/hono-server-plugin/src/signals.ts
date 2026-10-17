import process from 'node:process'

import type { Logger } from '@ultimabase/core'

const stopSignals = ['SIGINT', 'SIGTERM'] as const

/**
 * Stops the application on the first `SIGINT` or `SIGTERM` while the
 * managed listener runs (ADR-0340). Its listeners leave on that signal and
 * whenever the application stops, so a second signal ends the process with
 * Node.js's default behavior.
 */
export class StopOnSignals {
	readonly #logger: Logger
	readonly #stopApplication: () => Promise<void>
	readonly #onSignal = (signal: NodeJS.Signals): void => {
		this.unlisten()
		this.#logger.info(`${signal} received: stopping the application`)
		this.#stopApplication().catch((error: unknown) => {
			this.#logger.error(
				`stopping the application after ${signal} failed`,
				error instanceof Error ? error : { error },
			)
		})
	}

	constructor(logger: Logger, stopApplication: () => Promise<void>) {
		this.#logger = logger
		this.#stopApplication = stopApplication
	}

	listen(): void {
		for (const signal of stopSignals) process.once(signal, this.#onSignal)
	}

	unlisten(): void {
		for (const signal of stopSignals) process.off(signal, this.#onSignal)
	}
}

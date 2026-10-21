// What `defineApp` takes beside its database, plugins and models, and
// `transaction` (D-36, D-49, D-58).

type LogFunction = {
	(message: string): void
	(bindings: object, message?: string): void
}
/** Pino's interface (D-58); without one, the kernel writes JSON lines. */
export interface Logger {
	readonly info: LogFunction
	readonly warn: LogFunction
	readonly error: LogFunction
	child(bindings: object): Logger
}

/**
 * Refused in production unless written `{ key, production: true }` (D-49).
 * `undefined` leaves it off, so an unset environment variable passes as is.
 */
export type MasterKey =
	| string
	| undefined
	| { readonly key: string | undefined; readonly production: true }

/** Queries inside `run` join its transaction, with no `tx` (D-36). */
export declare function transaction<R>(run: () => Promise<R>): Promise<R>

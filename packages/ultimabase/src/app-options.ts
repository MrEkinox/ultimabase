// What `defineApp` takes beside its database, plugins and models (D-49,
// D-58).

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
 * Refused in production unless written `{ key, production: true }`, with 32
 * characters at least (D-49).
 * `undefined` leaves it off, so an unset environment variable passes as is.
 */
export type MasterKey =
	| string
	| undefined
	| { readonly key: string | undefined; readonly production: true }

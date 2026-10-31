// The errors a client may see (D-28, D-72). Any other error is masked as
// `INTERNAL` with a correlation id. `Refused` is for the developer (D-119).
import type { JsonValue } from './fields.ts'

/** The kernel's codes; a transport gives each its own status (D-72). */
export type ErrorCode =
	| 'ACCESS_DENIED'
	| 'NOT_FOUND'
	| 'VALIDATION_FAILED'
	| 'UNIQUE_VIOLATION'
	| 'RELATION_RESTRICTED'
	| 'UNAUTHENTICATED'
	| 'INVALID_CREDENTIALS'
	| 'TOO_MANY_ATTEMPTS'
	| 'CONFLICT'
	| 'INTERNAL'

/** One failing value, as Standard Schema reports it (D-23). */
export type Issue = {
	readonly path: readonly (string | number)[]
	readonly message: string
}

type Details<C> = C extends 'VALIDATION_FAILED'
	? { readonly issues: readonly Issue[] }
	: C extends 'TOO_MANY_ATTEMPTS'
		? { /** In seconds (D-113). */ readonly retryAfter: number }
		: JsonValue

/** An error whose code, message and details reach the client. */
export interface PublicError extends Error {
	readonly code: ErrorCode | Uppercase<string>
	readonly details?: JsonValue
}

type PublicErrorConstructor = {
	new <const C extends string>(
		code: C extends Uppercase<C> ? C : Uppercase<C>,
		message: string,
		options?: { readonly details?: Details<C>; readonly cause?: unknown },
	): PublicError
	readonly prototype: PublicError
}

class PublicErrorClass extends Error {
	readonly code: string
	readonly details?: JsonValue

	constructor(
		code: string,
		message: string,
		options?: { readonly details?: JsonValue; readonly cause?: unknown },
	) {
		super(
			message,
			options && 'cause' in options ? { cause: options.cause } : {},
		)
		this.name = 'PublicError'
		this.code = code
		if (options?.details !== undefined) this.details = options.details
	}
}

/**
 * The code is a kernel code, which keeps its meaning, or the application's
 * own, in capitals. Only the constructor is generic: `instanceof` would type
 * a generic class's members as `any`.
 */
export const PublicError: PublicErrorConstructor =
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the class is the constructor; only its generic signature is added.
	PublicErrorClass as unknown as PublicErrorConstructor

/**
 * A query argument the kernel does not know (D-20): a bug of the server
 * code, never public.
 */
export class InvalidQuery extends Error {
	readonly code = 'INVALID_QUERY'
	readonly path: string

	constructor(path: string, message: string) {
		super(message)
		this.name = 'InvalidQuery'
		this.path = path
	}
}

/**
 * A configuration refused while the application is defined or starts, whose
 * message says what is wrong and how to fix it: a command prints it without
 * its stack (D-119).
 */
export class Refused extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'Refused'
	}
}

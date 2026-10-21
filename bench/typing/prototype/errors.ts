// The errors a client may see (D-28, D-72). Any other error is masked as
// `INTERNAL` with a correlation id.
import type { JsonValue } from './fields.ts'

/** The kernel's codes; a transport gives each its own status (D-72). */
export type ErrorCode =
	| 'ACCESS_DENIED'
	| 'NOT_FOUND'
	| 'VALIDATION_FAILED'
	| 'UNIQUE_VIOLATION'
	| 'RELATION_RESTRICTED'
	| 'INTERNAL'

/** One failing value, as Standard Schema reports it (D-23). */
export type Issue = {
	readonly path: readonly (string | number)[]
	readonly message: string
}

type Details<C> = C extends 'VALIDATION_FAILED'
	? { readonly issues: readonly Issue[] }
	: JsonValue

/** An error whose code, message and details reach the client. */
export interface PublicError extends Error {
	readonly code: ErrorCode | Uppercase<string>
	readonly details?: JsonValue
}

/**
 * The code is a kernel code, which keeps its meaning, or the application's
 * own, in capitals. Only the constructor is generic: `instanceof` would type
 * a generic class's members as `any`.
 */
export declare const PublicError: {
	new <const C extends string>(
		code: C extends Uppercase<C> ? C : Uppercase<C>,
		message: string,
		options?: { readonly details?: Details<C>; readonly cause?: unknown },
	): PublicError
	readonly prototype: PublicError
}

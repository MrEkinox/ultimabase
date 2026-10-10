import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import {
	assertExactEnumerablePlainObject,
	assertPlainObject,
} from '../exact-object-validation.js'
import {
	ExposableError,
	frameworkErrorCodes,
	type ExposableErrorPayload,
	type FrameworkErrorDetails,
} from './framework-error.js'
import { isPluginErrorCode } from './plugin-error.js'

/** The code of a `PublicError` thrown without an explicit `code`. */
export type DefaultPublicErrorCode = 'APPLICATION_ERROR'

/** Configures one client-visible application error. */
export interface PublicErrorOptions<
	TCode extends string = string,
	TDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> {
	/**
	 * Stable code for clients: a constant identifier or a dot-namespaced code.
	 * Framework codes such as `PERMISSION_DENIED` are rejected.
	 * @example `code: 'todo.title-link'`
	 */
	readonly code?: TCode
	/**
	 * Plain object shown to clients next to the message.
	 * @example `details: { field: 'title' }`
	 */
	readonly details?: TDetails
	/** Diagnostic cause, kept for server logs and never serialized. */
	readonly cause?: unknown
}

/** The payload transports serialize for one `PublicError`. */
export interface PublicErrorPayload<
	TCode extends string = string,
	TDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> extends ExposableErrorPayload<TCode, TDetails> {
	readonly code: TCode
	readonly message: string
}

const publicErrorOptionKeys = new Set(['cause', 'code', 'details'])
const defaultPublicErrorCode: DefaultPublicErrorCode = 'APPLICATION_ERROR'

const validatePublicErrorCode = (code: string): void => {
	assertNonEmptyString(code, 'PublicError code')
	if (!isPluginErrorCode(code)) {
		throw new TypeError(
			`PublicError code must be namespaced or a constant identifier: ${code}`,
		)
	}
	if (frameworkErrorCodes.some((frameworkCode) => frameworkCode === code)) {
		throw new TypeError(
			`PublicError code cannot reuse the framework code ${code}`,
		)
	}
}

/**
 * Rejects an operation with a message and code the client may see.
 *
 * Thrown from a hook, an Access rule or predicate, an ACL callback, a virtual
 * field, a custom operation or an HTTP route handler, it aborts the operation
 * and rolls its transaction back. REST answers 400 with `{ code, message,
 * details }`; GraphQL reports it with `extensions.code`. Any other error stays
 * masked as an internal error. After commit it is only logged.
 *
 * @example
 * ```ts
 * throw new PublicError('A title cannot contain a link.', { code: 'todo.title-link' })
 * ```
 */
export class PublicError<
	const TCode extends string = DefaultPublicErrorCode,
	const TDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> extends ExposableError<TCode, TDetails, FrameworkErrorDetails> {
	constructor(
		message: string,
		options: PublicErrorOptions<TCode, TDetails> = {},
	) {
		const untrustedOptions: unknown = options
		assertExactEnumerablePlainObject(
			untrustedOptions,
			publicErrorOptionKeys,
			'Public error options must be a plain object',
			'Unknown PublicError option: ',
		)
		assertNonEmptyString(message, 'PublicError message')
		if (options.details !== undefined) {
			assertPlainObject(
				options.details,
				'PublicError details must be a plain object',
			)
		}
		// The default code is the documented literal of the default type argument.
		const code = (options.code ?? defaultPublicErrorCode) as TCode
		super(
			'PublicError',
			code,
			message,
			{
				...(options.cause === undefined ? {} : { cause: options.cause }),
				publicMessage: message,
				...(options.details === undefined
					? {}
					: { publicDetails: options.details }),
			},
			validatePublicErrorCode,
		)
	}

	/** Returns the code, message and details shown to clients. */
	override toJSON(): PublicErrorPayload<TCode, TDetails> {
		return immutableRecord({ ...super.toJSON(), message: this.message })
	}
}

/** Narrows an unknown failure to a client-visible application error. */
export const isPublicError = (error: unknown): error is PublicError<string> =>
	error instanceof PublicError

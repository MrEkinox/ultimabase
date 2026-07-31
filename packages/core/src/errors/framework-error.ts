import {
	assertNonEmptyString,
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

const declaredFrameworkErrorCodes = [
	'VALIDATION_ERROR',
	'NOT_FOUND',
	'PERMISSION_DENIED',
	'MASTER_ACCESS_DENIED',
	'MISSING_EXECUTION_CONTEXT',
	'PLUGIN_DEPENDENCY_MISSING',
	'PLUGIN_DEPENDENCY_CYCLE',
	'PLUGIN_DUPLICATE',
	'PLUGIN_CONFLICT',
	'TRANSACTION_ERROR',
	'INTERNAL_ERROR',
	'SERVICE_NOT_FOUND',
	'SERVICE_ALREADY_PROVIDED',
	'SERVICE_REGISTRY_DISPOSED',
] as const

/** Restricts framework-owned failures to codes transports can map exhaustively. */
export type FrameworkErrorCode = (typeof declaredFrameworkErrorCodes)[number]

/** Lists every stable code currently owned by the framework error contract. */
export const frameworkErrorCodes: readonly FrameworkErrorCode[] =
	immutableArray(declaredFrameworkErrorCodes)

/** Carries typed diagnostic or public metadata without an untyped escape hatch. */
export type FrameworkErrorDetails = Readonly<Record<string, unknown>>

/** Separates explicitly public values from trusted diagnostic information. */
export interface FrameworkErrorOptions<
	TPublicDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
	TInternalDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> extends ErrorOptions {
	readonly publicMessage?: string
	readonly publicDetails?: TPublicDetails
	readonly internalDetails?: TInternalDetails
	readonly retryable?: boolean
}

/** Defines the only error metadata safe for transport serialization. */
export interface FrameworkErrorPayload<
	TCode extends FrameworkErrorCode = FrameworkErrorCode,
	TPublicDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> {
	readonly code: TCode
	readonly retryable: boolean
	readonly message?: string
	readonly details?: Readonly<TPublicDetails>
}

const isFrameworkErrorCode = (value: unknown): value is FrameworkErrorCode =>
	typeof value === 'string' &&
	frameworkErrorCodes.some((frameworkCode) => frameworkCode === value)

const snapshotDetails = <const TDetails extends FrameworkErrorDetails>(
	details: TDetails | undefined,
	path: string,
): Readonly<TDetails> | undefined => {
	if (details === undefined) {
		return undefined
	}

	if (!isPlainRecord(details)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	// Error metadata must not change after it crosses the construction boundary.
	return immutableRecord(details)
}

/**
 * Carries one typed framework failure without coupling Core to any transport.
 *
 * Diagnostic values remain available to trusted logging while `toJSON` exposes
 * only values the caller explicitly marked as public.
 */
export class FrameworkError<
	const TCode extends FrameworkErrorCode = FrameworkErrorCode,
	const TPublicDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
	const TInternalDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> extends Error {
	readonly code: TCode
	readonly retryable: boolean
	readonly publicMessage: string | undefined
	readonly publicDetails: Readonly<TPublicDetails> | undefined
	readonly internalDetails: Readonly<TInternalDetails> | undefined

	constructor(
		code: TCode,
		message: string,
		options: FrameworkErrorOptions<TPublicDetails, TInternalDetails> = {},
	) {
		const untrustedOptions: unknown = options

		if (!isPlainRecord(untrustedOptions)) {
			throw new TypeError('Framework error options must be a plain object')
		}

		super(message, { cause: options.cause })

		if (!isFrameworkErrorCode(code)) {
			throw new TypeError(`Unknown framework error code: ${String(code)}`)
		}

		assertNonEmptyString(message, 'message')
		assertOptionalBoolean(options.retryable, 'retryable')

		if (options.publicMessage !== undefined) {
			assertNonEmptyString(options.publicMessage, 'publicMessage')
		}

		this.name = 'FrameworkError'
		this.code = code
		this.retryable = options.retryable ?? false
		this.publicMessage = options.publicMessage
		this.publicDetails = snapshotDetails(options.publicDetails, 'publicDetails')
		this.internalDetails = snapshotDetails(
			options.internalDetails,
			'internalDetails',
		)

		// Stable error identity and diagnostics must survive asynchronous handling unchanged.
		Object.freeze(this)
	}

	/** Returns an immutable payload that intentionally omits diagnostic state. */
	toJSON(): FrameworkErrorPayload<TCode, TPublicDetails> {
		return immutableRecord({
			code: this.code,
			retryable: this.retryable,
			...(this.publicMessage === undefined
				? {}
				: { message: this.publicMessage }),
			...(this.publicDetails === undefined
				? {}
				: { details: this.publicDetails }),
		})
	}
}

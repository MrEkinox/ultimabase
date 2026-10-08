import {
	assertNonEmptyString,
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

type ErrorDetails = Readonly<Record<string, unknown>>

export interface PublicErrorOptions<
	TPublicDetails extends ErrorDetails,
	TInternalDetails extends ErrorDetails,
> extends ErrorOptions {
	readonly publicMessage?: string
	readonly publicDetails?: TPublicDetails
	readonly internalDetails?: TInternalDetails
	readonly retryable?: boolean
}

export interface PublicErrorPayload<TCode extends string, TDetails> {
	readonly code: TCode
	readonly retryable: boolean
	readonly message?: string
	readonly details?: Readonly<TDetails>
}

const snapshotDetails = <const TDetails extends ErrorDetails>(
	details: TDetails | undefined,
	path: string,
): Readonly<TDetails> | undefined => {
	if (details === undefined) return undefined
	if (!isPlainRecord(details))
		throw new TypeError(`${path} must be a plain object`)
	return immutableRecord(details)
}

/** Owns the state shared by Core and plugin failures without becoming public API. */
export abstract class PublicError<
	const TCode extends string,
	const TPublicDetails extends ErrorDetails,
	const TInternalDetails extends ErrorDetails,
> extends Error {
	readonly code: TCode
	readonly retryable: boolean
	readonly publicMessage: string | undefined
	readonly publicDetails: Readonly<TPublicDetails> | undefined
	readonly internalDetails: Readonly<TInternalDetails> | undefined

	protected constructor(
		name: 'FrameworkError' | 'PluginError',
		code: TCode,
		message: string,
		options: PublicErrorOptions<TPublicDetails, TInternalDetails>,
		validateCode: (value: TCode) => void,
	) {
		const untrustedOptions: unknown = options
		if (!isPlainRecord(untrustedOptions)) {
			const owner = name === 'FrameworkError' ? 'Framework' : 'Plugin'
			throw new TypeError(`${owner} error options must be a plain object`)
		}
		super(message, { cause: options.cause })
		validateCode(code)
		assertNonEmptyString(message, 'message')
		assertOptionalBoolean(options.retryable, 'retryable')
		if (options.publicMessage !== undefined) {
			assertNonEmptyString(options.publicMessage, 'publicMessage')
		}

		this.name = name
		this.code = code
		this.retryable = options.retryable ?? false
		this.publicMessage = options.publicMessage
		this.publicDetails = snapshotDetails(options.publicDetails, 'publicDetails')
		this.internalDetails = snapshotDetails(
			options.internalDetails,
			'internalDetails',
		)
		Object.freeze(this)
	}

	toJSON(): PublicErrorPayload<TCode, TPublicDetails> {
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
	'PLUGIN_CAPABILITY_MISSING',
	'PLUGIN_ADAPTER_CAPABILITY_MISSING',
	'PLUGIN_CAPABILITY_CONFLICT',
	'PLUGIN_PROTOCOL_INCOMPATIBLE',
	'PLUGIN_PRIVILEGE_DENIED',
	'PLUGIN_DECLARATION_INVALID',
	'PLUGIN_OPERATION_INVALID',
	'PLUGIN_EXTENSION_HANDLER_MISSING',
	'RUNTIME_CALLBACK_CONTEXT_CLOSED',
	'RUNTIME_CALLBACK_RECURSION',
	'OPERATION_CANCELLED',
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
> extends PublicErrorOptions<TPublicDetails, TInternalDetails> {
	readonly retryable?: boolean
}

/** Defines the only error metadata safe for transport serialization. */
export interface FrameworkErrorPayload<
	TCode extends FrameworkErrorCode = FrameworkErrorCode,
	TPublicDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> extends PublicErrorPayload<TCode, TPublicDetails> {
	readonly code: TCode
}

const validateFrameworkErrorCode = (value: FrameworkErrorCode): void => {
	if (!frameworkErrorCodes.some((frameworkCode) => frameworkCode === value)) {
		throw new TypeError(`Unknown framework error code: ${value}`)
	}
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
> extends PublicError<TCode, TPublicDetails, TInternalDetails> {
	constructor(
		code: TCode,
		message: string,
		options: FrameworkErrorOptions<TPublicDetails, TInternalDetails> = {},
	) {
		super('FrameworkError', code, message, options, validateFrameworkErrorCode)
	}

	/** Returns an immutable payload that intentionally omits diagnostic state. */
	override toJSON(): FrameworkErrorPayload<TCode, TPublicDetails> {
		return super.toJSON()
	}
}

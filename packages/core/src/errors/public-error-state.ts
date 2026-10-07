import {
	assertNonEmptyString,
	assertOptionalBoolean,
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

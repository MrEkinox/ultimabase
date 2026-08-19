import {
	assertNonEmptyString,
	assertOptionalBoolean,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	FrameworkErrorDetails,
	FrameworkErrorOptions,
} from './framework-error.js'

/** Defines the safe payload a transport may serialize for one plugin domain failure. */
export interface PluginErrorPayload<
	TCode extends string = string,
	TPublicDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> {
	readonly code: TCode
	readonly retryable: boolean
	readonly message?: string
	readonly details?: Readonly<TPublicDetails>
}

const pluginErrorCodePattern =
	/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u

const snapshotDetails = <const TDetails extends FrameworkErrorDetails>(
	details: TDetails | undefined,
	path: string,
): Readonly<TDetails> | undefined => {
	if (details === undefined) return undefined
	if (!isPlainRecord(details))
		throw new TypeError(`${path} must be a plain object`)
	return immutableRecord(details)
}

/**
 * Carries one plugin-owned public error without exposing its diagnostic cause.
 *
 * Core validates the code against the executing operation's declared error set
 * before allowing a transport to observe this payload.
 */
export class PluginError<
	const TCode extends string = string,
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
			throw new TypeError('Plugin error options must be a plain object')
		}
		super(message, { cause: options.cause })
		assertNonEmptyString(code, 'plugin error code')
		if (!pluginErrorCodePattern.test(code)) {
			throw new TypeError(`plugin error code must be namespaced: ${code}`)
		}
		assertNonEmptyString(message, 'message')
		assertOptionalBoolean(options.retryable, 'retryable')
		if (options.publicMessage !== undefined) {
			assertNonEmptyString(options.publicMessage, 'publicMessage')
		}

		this.name = 'PluginError'
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

	/** Returns only values explicitly marked safe by the plugin author. */
	toJSON(): PluginErrorPayload<TCode, TPublicDetails> {
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

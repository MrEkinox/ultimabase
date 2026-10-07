import { assertNonEmptyString } from '@ultimabase/shared'

import {
	PublicError,
	type FrameworkErrorDetails,
	type FrameworkErrorOptions,
	type PublicErrorPayload,
} from './framework-error.js'

/** Defines the safe payload a transport may serialize for one plugin domain failure. */
export interface PluginErrorPayload<
	TCode extends string = string,
	TPublicDetails extends FrameworkErrorDetails = FrameworkErrorDetails,
> extends PublicErrorPayload<TCode, TPublicDetails> {
	readonly code: TCode
}

/** Constant identifiers or dot-namespaced codes accepted for plugin domain errors. */
export const pluginErrorCodePattern =
	/^(?:[A-Z][A-Z0-9_]*|[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/u

const validatePluginErrorCode = (code: string): void => {
	assertNonEmptyString(code, 'plugin error code')
	if (!pluginErrorCodePattern.test(code)) {
		throw new TypeError(
			`plugin error code must be namespaced or a constant identifier: ${code}`,
		)
	}
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
> extends PublicError<TCode, TPublicDetails, TInternalDetails> {
	constructor(
		code: TCode,
		message: string,
		options: FrameworkErrorOptions<TPublicDetails, TInternalDetails> = {},
	) {
		super('PluginError', code, message, options, validatePluginErrorCode)
	}

	/** Returns only values explicitly marked safe by the plugin author. */
	override toJSON(): PluginErrorPayload<TCode, TPublicDetails> {
		return super.toJSON()
	}
}

import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

const serviceTokenMarker: unique symbol = Symbol('UltimaBaseServiceToken')
declare const serviceTypeMarker: unique symbol

/**
 * Identifies one typed application service without using a global string key.
 *
 * Private symbol properties prevent structural construction and keep the
 * service type invariant without exposing runtime implementation metadata.
 */
export interface ServiceTokenIdentity {
	readonly debugName: string
	readonly [serviceTokenMarker]: true
}

export interface ServiceToken<TService> extends ServiceTokenIdentity {
	readonly [serviceTypeMarker]?: (service: TService) => TService
}

/** Protects registry boundaries from strings and structurally forged tokens. */
export function assertServiceToken(
	value: unknown,
): asserts value is ServiceTokenIdentity {
	if (
		!isPlainRecord(value) ||
		!(serviceTokenMarker in value) ||
		value[serviceTokenMarker] !== true
	) {
		throw new TypeError('token must be created by createServiceToken')
	}

	assertNonEmptyString(value.debugName, 'token.debugName')
}

/** Creates one immutable service identity with an exact inferred contract. */
export const createServiceToken = <TService>(
	debugName: string,
): ServiceToken<TService> => {
	assertNonEmptyString(debugName, 'debugName')

	const token: ServiceToken<TService> = {
		debugName,
		[serviceTokenMarker]: true,
	}

	return immutableRecord(token)
}

import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

const serviceTokenMarker: unique symbol = Symbol('UltimaBaseServiceToken')
declare const serviceTypeMarker: unique symbol

/**
 * Identifies one typed application service without using a global string key.
 *
 * Private symbol properties prevent structural construction and keep the
 * service type invariant without exposing runtime implementation metadata.
 */
export interface ServiceToken<TService> {
	readonly debugName: string
	readonly [serviceTokenMarker]: true
	readonly [serviceTypeMarker]?: (service: TService) => TService
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

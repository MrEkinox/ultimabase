import {
	FrameworkError,
	PluginError,
	type ApplicationOperationTransport,
	type OperationTransportRequest,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

/** Represents the transport-safe success or failure returned by the fake protocol. */
export type FakeOperationTransportResponse =
	| Readonly<{ readonly ok: true; readonly result: unknown }>
	| Readonly<{
			readonly ok: false
			readonly error: Readonly<{
				readonly code: string
				readonly retryable: boolean
				readonly message?: string
				readonly details?: Readonly<Record<string, unknown>>
			}>
	  }>

/**
 * Proves the generic public binding without introducing HTTP or GraphQL.
 *
 * Unknown exceptions collapse to one safe internal payload; diagnostic causes,
 * plugin options, adapters, and request authority are never serialized.
 */
export class FakePublicOperationTransport {
	constructor(private readonly exposure: ApplicationOperationTransport) {
		Object.freeze(this)
	}

	async request(
		request: OperationTransportRequest,
	): Promise<FakeOperationTransportResponse> {
		try {
			return immutableRecord({
				ok: true as const,
				result: await this.exposure.execute(request),
			})
		} catch (error: unknown) {
			if (error instanceof FrameworkError || error instanceof PluginError) {
				return immutableRecord({ ok: false as const, error: error.toJSON() })
			}
			return immutableRecord({
				ok: false as const,
				error: immutableRecord({
					code: 'INTERNAL_ERROR',
					message: 'The operation could not be completed.',
					retryable: false,
				}),
			})
		}
	}
}

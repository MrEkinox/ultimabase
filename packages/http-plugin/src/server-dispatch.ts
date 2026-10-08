import type { HttpApplication } from './application.js'
import {
	createHttpPreDispatchErrorResponse,
	httpPreDispatchErrorCodes,
	prepareHttpServerRequestOrReject,
	type HttpServerRequest,
} from './request-boundary.js'

/**
 * Dispatches to the provider's sole HTTP owner, or safely rejects when it is absent.
 * Providers clear their owner before shutdown; externally owned listeners may remain open.
 * @example
 * const response = await dispatchHttpApplicationRequest(activeApplication, input)
 */
export const dispatchHttpApplicationRequest = async (
	application: HttpApplication | undefined,
	input: HttpServerRequest,
): Promise<Response> => {
	if (application !== undefined) return application.fetch(input)
	// Keep original-header and correlation validation even after the application stops.
	const prepared = prepareHttpServerRequestOrReject(input)
	return prepared instanceof Response
		? prepared
		: createHttpPreDispatchErrorResponse(
				httpPreDispatchErrorCodes.applicationRejected,
				prepared.requestId,
			)
}

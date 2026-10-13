import { isPlainRecord } from '@ultimabase/shared'

import type { ApplicationCapabilityFactoryContext } from '@ultimabase/core/plugin'
import type { HttpServerRequest } from './request-boundary.js'

type Logger = ApplicationCapabilityFactoryContext['logger']

/**
 * @internal Logs one line per request: never bodies, queries, headers or
 * credentials.
 */
export const logHttpAccess = (
	logger: Logger,
	input: HttpServerRequest,
	status: number,
	startedAt: number,
	requestId: string | null,
): void => {
	const request: unknown = isPlainRecord(input) ? input.request : undefined
	const method = request instanceof Request ? request.method : 'UNKNOWN'
	const path = request instanceof Request ? new URL(request.url).pathname : ''
	const durationMs = Math.round(performance.now() - startedAt)
	logger.info(`${method} ${path} ${String(status)} ${String(durationMs)}ms`, {
		durationMs,
		method,
		path,
		requestId,
		status,
	})
}

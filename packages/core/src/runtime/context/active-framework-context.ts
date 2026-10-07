import { runApplicationWork } from '../../application/active-application.js'
import { FrameworkError } from '../../foundation.js'
import type { PluginDefinition } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'

import { RequestEngine } from '../engine/framework-engine.js'
import { readRequestEngineApplication } from '../engine/request-engine.js'
import type { RequestContext } from './request-context.js'
import {
	getActiveFrameworkContext,
	runWithRequestEngineScope,
	type ActiveFrameworkContext,
} from './active-framework-storage.js'

/** Resolves the active scope for the focused public contextual helpers. */
const requireCurrentFrameworkContext = (): ActiveFrameworkContext => {
	const context: ActiveFrameworkContext | undefined =
		getActiveFrameworkContext()

	if (context === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'No RequestEngine is active in the current asynchronous scope.',
			{ publicMessage: 'No request execution context is available.' },
		)
	}

	return context
}

/** Returns the request-bound engine from the current asynchronous scope. */
export const getCurrentEngine = (): RequestEngine =>
	requireCurrentFrameworkContext().requestEngine

/** Returns the immutable request identity carried by the current engine. */
export const getCurrentRequest = (): RequestContext =>
	requireCurrentFrameworkContext().request

/**
 * Runs one callback in an isolated request scope while preserving its exact
 * synchronous or asynchronous result type.
 */
export const runWithRequestEngine = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TRequest extends RequestContext,
	TResult,
>(
	requestEngine: RequestEngine<TSchemas, TPlugins, TRequest>,
	callback: () => TResult,
): TResult => {
	if (!(requestEngine instanceof RequestEngine)) {
		throw new TypeError('Active context engine must be a RequestEngine')
	}

	if (typeof callback !== 'function') {
		throw new TypeError('Active context callback must be a function')
	}

	return runApplicationWork(readRequestEngineApplication(requestEngine), () =>
		runWithRequestEngineScope(requestEngine, callback),
	)
}

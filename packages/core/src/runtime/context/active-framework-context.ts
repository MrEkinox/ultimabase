import { FrameworkError } from '../../foundation.js'
import type { PluginDefinition } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'

import { RequestEngine } from '../engine/framework-engine.js'
import type { RequestContext } from './request-context.js'
import {
	getActiveFrameworkContext,
	runWithRequestEngineScope,
	type ActiveFrameworkContext,
} from './active-framework-storage.js'

export type { ActiveFrameworkContext } from './active-framework-storage.js'

/** Returns the active scope or fails instead of leaking a previous request. */
export const getCurrentFrameworkContext = (): ActiveFrameworkContext => {
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
export const getCurrentEngine = (): ActiveFrameworkContext['requestEngine'] =>
	getCurrentFrameworkContext().requestEngine

/** Returns the application-wide engine owning the current request engine. */
export const getCurrentApplicationEngine =
	(): ActiveFrameworkContext['frameworkEngine'] =>
		getCurrentFrameworkContext().frameworkEngine

/** Returns the application owning the current asynchronous request scope. */
export const getCurrentApplication =
	(): ActiveFrameworkContext['application'] =>
		getCurrentFrameworkContext().application

/** Returns the immutable request identity carried by the current engine. */
export const getCurrentRequest = (): ActiveFrameworkContext['request'] =>
	getCurrentFrameworkContext().request

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

	return runWithRequestEngineScope(requestEngine, callback)
}

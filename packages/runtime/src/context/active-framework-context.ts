import { AsyncLocalStorage } from 'node:async_hooks'

import type { FrameworkApplication, PluginDefinition } from '@ultimabase/core'
import { FrameworkError } from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/schema'
import { immutableRecord } from '@ultimabase/shared'

import type { RequestContext } from './request-context.js'
import {
	type FrameworkEngine,
	RequestEngine,
} from '../engine/framework-engine.js'

/** Exposes the consistent application and request references derived from one engine. */
export interface ActiveFrameworkContext<
	TSchemas extends readonly SchemaDefinition[] = readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[] = readonly PluginDefinition[],
	TRequest extends RequestContext = RequestContext,
> {
	readonly application: FrameworkApplication<TSchemas, TPlugins>
	readonly frameworkEngine: FrameworkEngine<TSchemas, TPlugins>
	readonly requestEngine: RequestEngine<TSchemas, TPlugins, TRequest>
	readonly request: TRequest
}

const activeFrameworkStorage = new AsyncLocalStorage<ActiveFrameworkContext>()

/** Creates one immutable view without accepting independently forgeable references. */
const createActiveFrameworkContext = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TRequest extends RequestContext,
>(
	requestEngine: RequestEngine<TSchemas, TPlugins, TRequest>,
): ActiveFrameworkContext<TSchemas, TPlugins, TRequest> =>
	immutableRecord({
		application: requestEngine.application,
		frameworkEngine: requestEngine.framework,
		requestEngine,
		request: requestEngine.context,
	})

/** Returns the active scope or fails instead of leaking a previous request. */
export const getCurrentFrameworkContext = (): ActiveFrameworkContext => {
	const context = activeFrameworkStorage.getStore()

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

	return activeFrameworkStorage.run(
		createActiveFrameworkContext(requestEngine),
		callback,
	)
}

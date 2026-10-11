import { AsyncLocalStorage } from 'node:async_hooks'

import { runApplicationWork } from '../../application/active-application.js'
import { FrameworkError } from '../../foundation.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import {
	runWithQueryExecution,
	type QueryExecutionDispatcher,
} from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'

import { RequestEngine } from '../engine/framework-engine.js'
import { readRequestEngineApplication } from '../engine/request-engine.js'
import type { RequestContext } from './request-context.js'

// The engine is the only stored reference; application and request derive from it.
const activeRequestEngine = new AsyncLocalStorage<RequestEngine>()

/** @internal Reads the current engine without deciding the missing-scope error. */
export const getActiveRequestEngine = (): RequestEngine | undefined =>
	activeRequestEngine.getStore()

/** Runs telemetry without granting contextual access to the active request engine. */
export const runOutsideRequestEngineScope = <TResult>(
	callback: () => TResult,
): TResult => activeRequestEngine.exit(callback)

/**
 * @internal Opens a derived scope after the public boundary has validated or
 * internally constructed the exact RequestEngine identity.
 */
export const runWithRequestEngineScope = <TResult>(
	requestEngine: RequestEngine,
	callback: () => TResult,
): TResult =>
	runWithQueryExecution(
		readRequestEngineApplication(requestEngine),
		// Application ownership is checked by RequestEngine before the erased bridge executes.
		requestEngine as unknown as QueryExecutionDispatcher,
		() => activeRequestEngine.run(requestEngine, callback),
	)

/** Resolves the active scope for the focused public contextual helpers. */
const requireCurrentEngine = (): RequestEngine => {
	const engine = activeRequestEngine.getStore()
	if (engine !== undefined) return engine
	throw new FrameworkError(
		'MISSING_EXECUTION_CONTEXT',
		'No RequestEngine is active in the current asynchronous scope.',
		{ publicMessage: 'No request execution context is available.' },
	)
}

/** Returns the request-bound engine from the current asynchronous scope. */
export const getCurrentEngine = (): RequestEngine => requireCurrentEngine()

/** Returns the immutable request identity carried by the current engine. */
export const getCurrentRequest = (): RequestContext =>
	requireCurrentEngine().context

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

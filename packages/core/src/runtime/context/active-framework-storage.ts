import { AsyncLocalStorage } from 'node:async_hooks'

import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import type {
	FrameworkEngine,
	RequestEngine,
} from '../engine/framework-engine.js'
import type { RequestContext } from './request-context.js'

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

/** Reads the current native store without deciding the public missing-scope error. */
export const getActiveFrameworkContext = ():
	ActiveFrameworkContext | undefined => activeFrameworkStorage.getStore()

/** Runs telemetry without granting contextual access to the active request engine. */
export const runOutsideRequestEngineScope = <TResult>(
	callback: () => TResult,
): TResult => activeFrameworkStorage.exit(callback)

/**
 * Opens a derived scope after the public boundary has validated or internally
 * constructed the exact RequestEngine identity.
 */
export const runWithRequestEngineScope = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TRequest extends RequestContext,
	TResult,
>(
	requestEngine: RequestEngine<TSchemas, TPlugins, TRequest>,
	callback: () => TResult,
): TResult =>
	activeFrameworkStorage.run(
		createActiveFrameworkContext(requestEngine),
		callback,
	)

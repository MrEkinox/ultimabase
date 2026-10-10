import type {
	AnonymousRequestAccess,
	RequestAccess,
} from '../../access/request/access.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { PluginSourceState } from '../../plugins/source-projections.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type {
	RequestContext,
	RequestContextOptions,
} from '../context/request-context.js'
import type { RequestEngine } from '../engine/request-engine.js'
import type { MasterKeyGrant } from '../master/master-authority.js'
import { readStartedUltimaBaseEngine, type UltimaBase } from './ultima-base.js'

// Request-context machinery is for plugin authors (ADR-0311): applications use
// `useMasterKey` and `ultimabase.transaction(fn)` instead.

/**
 * Creates one anonymous request engine on a started application, for plugin
 * code that composes requests outside a transport.
 *
 * @example `const engine = anonymous(ultimabase, { requestId, source: 'internal' })`
 */
export const anonymous = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
	const TRequestSource extends string,
>(
	app: UltimaBase<TSchemas, TPlugins, TSource>,
	options: RequestContextOptions<TRequestSource>,
): RequestEngine<
	TSchemas,
	TPlugins,
	RequestContext<AnonymousRequestAccess, TRequestSource>
> => readStartedUltimaBaseEngine(app).anonymous(options)

/**
 * Binds one validated request context to a started application.
 *
 * @example `const engine = withContext(ultimabase, context)`
 */
export const withContext = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
	TAccess extends RequestAccess,
	const TRequestSource extends string,
>(
	app: UltimaBase<TSchemas, TPlugins, TSource>,
	context: RequestContext<TAccess, TRequestSource>,
): RequestEngine<TSchemas, TPlugins, RequestContext<TAccess, TRequestSource>> =>
	readStartedUltimaBaseEngine(app).withContext(context)

/**
 * Verifies one configured raw Master credential for a transport without
 * retaining it; the grant elevates a request engine through `useMasterKey`.
 *
 * @example `const grant = authorizeMasterKey(ultimabase, headerValue)`
 */
export const authorizeMasterKey = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TSource extends PluginSourceState,
>(
	app: UltimaBase<TSchemas, TPlugins, TSource>,
	rawKey: string,
): MasterKeyGrant => readStartedUltimaBaseEngine(app).authorizeMasterKey(rawKey)

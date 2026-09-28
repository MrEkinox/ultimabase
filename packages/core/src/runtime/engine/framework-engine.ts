import {
	assertFrameworkEngineOptions,
	type FrameworkEngineOptions,
} from './engine-options.js'
export type { FrameworkEngineOptions } from './engine-options.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import { FrameworkError, type PluginDefinition } from '../../foundation.js'
import type {
	AnonymousRequestAccess,
	RequestAccess,
} from '../../access/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	RequestContext,
	type RequestContextOptions,
} from '../context/request-context.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	bindMasterGrantApplication,
	type MasterKeyGrant,
} from '../master/master-authority.js'
import { exposeFrameworkOperations } from '../plugin-operations/engine-integration.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
} from '../plugin-operations/transport.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import {
	assertApplicationEngineAvailable,
	bindRequestContextToApplication,
} from './application-binding.js'
import {
	bindFrameworkMasterAuthority,
	getFrameworkMasterAuthority,
	readFrameworkMasterAuthority,
} from './framework-master-authority.js'
import { RequestEngine } from './request-engine.js'
import { requestEngineConstructionKey } from './request-engine-construction.js'
import { readApplicationFacade } from '../context/current-ultima-base.js'
import type { UltimaBase } from '../application/ultima-base.js'

export { RequestEngine } from './request-engine.js'
export type { RequestTransactionHandler } from './request-engine.js'

/**
 * Owns application-wide execution dependencies and creates isolated request
 * engines without carrying request authority itself.
 */
export class FrameworkEngine<
	const TSchemas extends readonly SchemaDefinition[] =
		readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[] =
		readonly PluginDefinition[],
> {
	readonly application: FrameworkApplication<TSchemas, TPlugins>
	readonly #pipeline: RuntimePipeline

	constructor(options: FrameworkEngineOptions<TSchemas, TPlugins>) {
		assertFrameworkEngineOptions(options)
		assertApplicationEngineAvailable(options.application)
		this.application = options.application
		this.#pipeline = options.pipeline

		if (options.masterAuthority !== undefined) {
			bindFrameworkMasterAuthority(this, options.masterAuthority)
		}

		Object.freeze(this)
	}

	/** Resolves the sole public owner without exposing the private kernel. */
	get ultimabase(): UltimaBase<TSchemas, TPlugins> {
		return readApplicationFacade(this.application) as UltimaBase<
			TSchemas,
			TPlugins
		>
	}

	/** Verifies one raw credential without retaining it in framework state. */
	authorizeMasterKey(rawKey: string): MasterKeyGrant {
		assertApplicationEngineAvailable(this.application)
		return bindMasterGrantApplication(
			getFrameworkMasterAuthority(this).authorize(rawKey),
			this.application,
		)
	}

	/** Binds one already validated transport or internal request context. */
	withContext<TAccess extends RequestAccess, const TSource extends string>(
		context: RequestContext<TAccess, TSource>,
	): RequestEngine<TSchemas, TPlugins, RequestContext<TAccess, TSource>> {
		assertApplicationEngineAvailable(this.application)
		if (!(context instanceof RequestContext)) {
			throw new TypeError('Framework engine context must be a RequestContext')
		}

		bindRequestContextToApplication(
			this.application,
			context,
			readFrameworkMasterAuthority(this),
		)

		return new RequestEngine(
			requestEngineConstructionKey,
			this,
			context,
			this.#pipeline,
		)
	}

	/** Creates one anonymous request engine without introducing public identity. */
	anonymous<const TSource extends string>(
		options: RequestContextOptions<TSource>,
	): RequestEngine<
		TSchemas,
		TPlugins,
		RequestContext<AnonymousRequestAccess, TSource>
	> {
		return this.withContext(RequestContext.anonymous(options))
	}

	/** Creates one immutable public-operation allowlist for a transport protocol. */
	exposeOperations<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportExposureOptions<TTransport>,
	): ApplicationOperationTransport<TTransport> {
		assertApplicationEngineAvailable(this.application)
		return exposeFrameworkOperations(this, options)
	}

	/** Keeps schema identity checks centralized for queries and direct operations. */
	assertOwnsSchema(schema: unknown): asserts schema is TSchemas[number] {
		assertApplicationEngineAvailable(this.application)
		if (this.application.ownsSchema(schema)) {
			return
		}

		const className: string = Schema.is(schema) ? schema.className : 'unknown'

		throw new FrameworkError(
			'VALIDATION_ERROR',
			`Schema does not belong to this application: ${className}`,
			{
				publicMessage: 'The requested schema is not available.',
				internalDetails: { className },
			},
		)
	}
}

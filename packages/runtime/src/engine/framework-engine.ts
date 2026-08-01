import {
	FrameworkApplication,
	FrameworkError,
	type PluginDefinition,
} from '@ultimabase/core'
import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
	RequestAccess,
	UserRequestAccess,
} from '@ultimabase/access'
import { Query } from '@ultimabase/query'
import type { BoundQuery, ExecutableOperationAst } from '@ultimabase/query'
import type { SchemaDefinition } from '@ultimabase/schema'
import type { MaybePromise } from '@ultimabase/shared'
import { isPlainRecord } from '@ultimabase/shared'

import {
	RequestContext,
	type RequestContextOptions,
} from '../context/request-context.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import type { DatabaseOperationResult } from '../database/contracts.js'
import {
	MasterAuthority,
	type MasterKeyGrant,
} from '../master/master-authority.js'
import { getOperationSchema } from '../operations/schema.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { runRequestTransaction } from '../transactions/run-transaction.js'
import { requiresAtomicBulkTransaction } from '../transactions/atomic-bulk.js'
import {
	createNestedTransactionError,
	type TransactionLifetime,
} from '../transactions/transaction-lifetime.js'

const requestEngineConstructionKey: unique symbol = Symbol(
	'ultimabase.request-engine-construction',
)

/** Receives one transaction-scoped engine while preserving its exact context type. */
export type RequestTransactionHandler<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
	TContext extends RequestContext,
	TResult,
> = (
	engine: RequestEngine<TSchemas, TPlugins, TContext>,
) => MaybePromise<TResult>

/** Captures every application-owned dependency shared by its request engines. */
export interface FrameworkEngineOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> {
	readonly application: FrameworkApplication<TSchemas, TPlugins>
	readonly masterAuthority?: MasterAuthority
	readonly pipeline: RuntimePipeline
}

const frameworkMasterAuthorities = new WeakMap<
	FrameworkEngine,
	MasterAuthority
>()

const getFrameworkMasterAuthority = (
	framework: FrameworkEngine,
): MasterAuthority => {
	const authority = frameworkMasterAuthorities.get(framework)

	if (authority === undefined) {
		throw new FrameworkError(
			'PERMISSION_DENIED',
			'Master authority is not configured for this framework engine.',
			{ publicMessage: 'Master authority is not available.' },
		)
	}

	return authority
}

/** Rejects malformed low-level construction before it can bind request state. */
const assertFrameworkEngineOptions = (
	options: FrameworkEngineOptions<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): void => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('Framework engine options must be a plain object')
	}

	if (!(untrustedOptions.application instanceof FrameworkApplication)) {
		throw new TypeError(
			'Framework engine application must be a FrameworkApplication',
		)
	}

	if (!(untrustedOptions.pipeline instanceof RuntimePipeline)) {
		throw new TypeError('Framework engine pipeline must be a RuntimePipeline')
	}

	if (
		untrustedOptions.masterAuthority !== undefined &&
		!(untrustedOptions.masterAuthority instanceof MasterAuthority)
	) {
		throw new TypeError(
			'Framework engine masterAuthority must be a MasterAuthority',
		)
	}
}

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
		this.application = options.application
		this.#pipeline = options.pipeline

		if (options.masterAuthority !== undefined) {
			frameworkMasterAuthorities.set(this, options.masterAuthority)
		}

		// Application ownership and execution dependencies remain stable for its lifetime.
		Object.freeze(this)
	}

	/** Verifies one raw credential without retaining it in framework state. */
	authorizeMasterKey(rawKey: string): MasterKeyGrant {
		return getFrameworkMasterAuthority(this).authorize(rawKey)
	}

	/** Binds one already validated transport or internal request context. */
	withContext<TAccess extends RequestAccess, const TSource extends string>(
		context: RequestContext<TAccess, TSource>,
	): RequestEngine<TSchemas, TPlugins, RequestContext<TAccess, TSource>> {
		if (!(context instanceof RequestContext)) {
			throw new TypeError('Framework engine context must be a RequestContext')
		}

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

	/** Creates one authenticated request engine from its stable user identifier. */
	user<const TUserId extends string, const TSource extends string>(
		userId: TUserId,
		options: RequestContextOptions<TSource>,
	): RequestEngine<
		TSchemas,
		TPlugins,
		RequestContext<UserRequestAccess<TUserId>, TSource>
	> {
		return this.withContext(RequestContext.user(userId, options))
	}

	/** Keeps schema identity checks centralized for queries and direct operations. */
	assertOwnsSchema(schema: unknown): asserts schema is TSchemas[number] {
		if (this.application.ownsSchema(schema)) {
			return
		}

		const className: string =
			isPlainRecord(schema) && typeof schema.className === 'string'
				? schema.className
				: 'unknown'

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

/**
 * Carries immutable request authority into queries, operations, and an
 * adapter-backed transaction scope without exposing infrastructure state.
 */
export class RequestEngine<
	const TSchemas extends readonly SchemaDefinition[] =
		readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[] =
		readonly PluginDefinition[],
	TContext extends RequestContext = RequestContext,
> {
	readonly context: TContext
	readonly framework: FrameworkEngine<TSchemas, TPlugins>
	readonly #pipeline: RuntimePipeline
	readonly #transactionLifetime: TransactionLifetime | undefined

	constructor(
		constructionKey: typeof requestEngineConstructionKey,
		framework: FrameworkEngine<TSchemas, TPlugins>,
		context: TContext,
		pipeline: RuntimePipeline,
		transactionLifetime?: TransactionLifetime,
	) {
		if (constructionKey !== requestEngineConstructionKey) {
			throw new TypeError(
				'Request engines must be created by their FrameworkEngine',
			)
		}

		this.framework = framework
		this.context = context
		this.#pipeline = pipeline
		this.#transactionLifetime = transactionLifetime

		// A request engine cannot change application or authority after binding.
		Object.freeze(this)
	}

	get application(): FrameworkApplication<TSchemas, TPlugins> {
		return this.framework.application
	}

	/** Creates an immutable query already bound to this exact request engine. */
	query<const TSchema extends TSchemas[number]>(
		schema: TSchema,
	): BoundQuery<TSchema, never, RequestEngine<TSchemas, TPlugins, TContext>> {
		this.#transactionLifetime?.assertActive()
		this.framework.assertOwnsSchema(schema)

		return new Query(schema).bind<RequestEngine<TSchemas, TPlugins, TContext>>(
			this,
		)
	}

	/** Executes a normalized operation through this request's mandatory pipeline. */
	execute<const TOperation extends ExecutableOperationAst<TSchemas[number]>>(
		operation: TOperation,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.framework.assertOwnsSchema(getOperationSchema(operation))

		if (
			this.#transactionLifetime === undefined &&
			requiresAtomicBulkTransaction(operation)
		) {
			// Automatic bulk transactions reuse the exact public transaction lifecycle.
			return this.transaction((transaction) => transaction.execute(operation))
		}

		const executeOperation = (): Promise<DatabaseOperationResult<TOperation>> =>
			this.#pipeline.execute({ context: this.context, operation })

		return this.#transactionLifetime === undefined
			? executeOperation()
			: this.#transactionLifetime.run(executeOperation)
	}

	/** Produces an audited master engine from an authority-owned opaque grant. */
	async useMasterKey(
		grant: MasterKeyGrant,
		reason: string,
	): Promise<
		RequestEngine<
			TSchemas,
			TPlugins,
			RequestContext<MasterRequestAccess, TContext['source']>
		>
	> {
		this.#transactionLifetime?.assertActive()

		const masterContext = await getFrameworkMasterAuthority(
			this.framework,
		).elevate(grant, this.context, reason)

		return new RequestEngine(
			requestEngineConstructionKey,
			this.framework,
			masterContext,
			this.#pipeline,
			this.#transactionLifetime,
		)
	}

	/** Opens one adapter transaction while preserving this context and application. */
	transaction<TResult>(
		handler: RequestTransactionHandler<TSchemas, TPlugins, TContext, TResult>,
	): Promise<TResult> {
		if (typeof handler !== 'function') {
			throw new TypeError(
				'Request engine transaction handler must be a function',
			)
		}

		if (this.#transactionLifetime !== undefined) {
			this.#transactionLifetime.assertActive()

			const error: FrameworkError<'TRANSACTION_ERROR'> =
				createNestedTransactionError()

			this.#transactionLifetime.markFailed(error)
			throw error
		}

		return runRequestTransaction(
			this.#pipeline,
			(transactionPipeline, lifetime) =>
				new RequestEngine(
					requestEngineConstructionKey,
					this.framework,
					this.context,
					transactionPipeline,
					lifetime,
				),
			(transaction) =>
				runWithRequestEngineScope(transaction, () => handler(transaction)),
		)
	}
}

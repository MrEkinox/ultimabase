import {
	FrameworkApplication,
	FrameworkError,
	type PluginDefinition,
} from '../../foundation.js'
import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
	RequestAccess,
} from '../../access/index.js'
import type {
	ExecutableOperationAst,
	InferOperationResult,
	OperationAstNode,
} from '../../query/index.js'
import {
	registerQueryTerminalExecutionHandler,
	type NormalizedQueryTerminalOptions,
	type QueryTerminalPrivateScope,
} from '../../query/operations/execution.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { MaybePromise } from '@ultimabase/shared'
import { isPlainRecord } from '@ultimabase/shared'

import {
	getRequestContextOwner,
	isRequestContext,
	RequestContext,
	setRequestContextOwner,
	type RequestContextOptions,
} from '../context/request-context.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import type {
	DatabaseOperationResult,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	elevateTrustedMasterRequest,
	MasterAuthority,
	type MasterKeyGrant,
} from '../master/master-authority.js'
import { getOperationSchema } from '../operations/schema.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { runRequestTransaction } from '../transactions/run-transaction.js'
import { requiresAutomaticMutationTransaction } from '../transactions/automatic-mutation.js'
import {
	createNestedTransactionError,
	type TransactionLifetime,
} from '../transactions/transaction-lifetime.js'
import { throwIfOperationCancelled } from '../hooks/cancellation.js'
import { resolvePointerInclusions } from '../relations/pointer-inclusion.js'

const requestEngineConstructionKey: unique symbol = Symbol(
	'ultimabase.request-engine-construction',
)

/** Closes every escaped execution object when its application starts teardown. */
const assertApplicationEngineAvailable = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): void => {
	if (
		application.state === 'stopping' ||
		application.state === 'stopped' ||
		application.state === 'disposing' ||
		application.state === 'disposed'
	) {
		throw new TypeError(
			`Framework engine cannot be used while application is ${application.state}`,
		)
	}
}

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

/** Claims an unbound context or rejects reuse across isolated applications. */
const bindRequestContextToFramework = (
	framework: FrameworkEngine,
	context: RequestContext,
): void => {
	const owner = getRequestContextOwner(context)

	if (owner !== undefined && owner !== framework.application) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Explicit request context belongs to another application.',
			{
				publicMessage: 'The request context is not available.',
				internalDetails: {
					reason: 'query-terminal-context-application-mismatch',
				},
			},
		)
	}

	if (owner === undefined) {
		setRequestContextOwner(context, framework.application)
	}
}

/** Builds a stable audit reason without retaining terminal options in the AST. */
const createTerminalMasterReason = (
	operation: OperationAstNode,
	schema: SchemaDefinition,
): string => `Query terminal ${operation.kind} on ${schema.className}`

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
		assertApplicationEngineAvailable(this.application)

		return getFrameworkMasterAuthority(this).authorize(rawKey)
	}

	/** Binds one already validated transport or internal request context. */
	withContext<TAccess extends RequestAccess, const TSource extends string>(
		context: RequestContext<TAccess, TSource>,
	): RequestEngine<TSchemas, TPlugins, RequestContext<TAccess, TSource>> {
		assertApplicationEngineAvailable(this.application)

		if (!(context instanceof RequestContext)) {
			throw new TypeError('Framework engine context must be a RequestContext')
		}

		bindRequestContextToFramework(this, context)

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
		registerQueryTerminalExecutionHandler(this, (operation, options, scope) =>
			this.#executeTerminal(operation, options, scope),
		)

		// A request engine cannot change application or authority after binding.
		Object.freeze(this)
	}

	/** Resolves trusted terminal authority while retaining this engine's lifetime. */
	async #executeTerminal(
		operation: unknown,
		options: NormalizedQueryTerminalOptions,
		scope: QueryTerminalPrivateScope | undefined,
	): Promise<unknown> {
		const normalizedOperation = operation as ExecutableOperationAst<
			TSchemas[number]
		>
		const schema = getOperationSchema(normalizedOperation)

		this.framework.assertOwnsSchema(schema)

		if (scope?.kind === 'relation') {
			this.framework.assertOwnsSchema(scope.source)
			const relation = this.framework.application.schemaTargets.getRelation(
				scope.source,
				scope.fieldPath,
			)

			if (relation?.target !== schema || scope.target !== schema) {
				throw new FrameworkError(
					'VALIDATION_ERROR',
					'Relation query scope does not match the executed target schema.',
					{ publicMessage: 'The requested relation is not available.' },
				)
			}

			// Issue 744 will pass the already validated private edge to an adapter
			// capability. Failing closed prevents an ordinary target query today.
			throw new FrameworkError(
				'INTERNAL_ERROR',
				'Relation query execution requires database relation support.',
				{ publicMessage: 'Relation queries are not available.' },
			)
		}

		let context: RequestContext = this.context

		if (options.context !== undefined) {
			if (!isRequestContext(options.context)) {
				throw new TypeError(
					'query terminal context must be a RequestContext instance',
				)
			}

			bindRequestContextToFramework(this.framework, options.context)
			context = options.context
		}

		if (options.useMasterKey) {
			context = await elevateTrustedMasterRequest(
				getFrameworkMasterAuthority(this.framework),
				context,
				createTerminalMasterReason(normalizedOperation, schema),
			)
		}

		const engine =
			context === this.context
				? this
				: new RequestEngine(
						requestEngineConstructionKey,
						this.framework,
						context,
						this.#pipeline,
						this.#transactionLifetime,
					)

		// Query terminal construction guarantees an executable operation for this schema.
		return engine.#executeOperation(normalizedOperation, scope?.rowFilter)
	}

	get application(): FrameworkApplication<TSchemas, TPlugins> {
		return this.framework.application
	}

	/** Executes a normalized operation through this request's mandatory pipeline. */
	async execute<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(operation: TOperation): Promise<InferOperationResult<TOperation>> {
		return this.#executeOperation(operation)
	}

	/** Executes public and framework-scoped operations through one shared lifecycle. */
	async #executeOperation<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(
		operation: TOperation,
		rowFilter?: DatabaseRowFilterNode,
		nativeAccessDeniedAsMissing?: true,
	): Promise<InferOperationResult<TOperation>> {
		this.framework.assertOwnsSchema(getOperationSchema(operation))
		throwIfOperationCancelled(this.context.signal, {
			operationKind: operation.kind,
			phase: 'request-engine',
		})

		if (
			this.#transactionLifetime === undefined &&
			requiresAutomaticMutationTransaction(operation)
		) {
			// Every root mutation reuses the exact public transaction lifecycle.
			return this.transaction((transaction) =>
				transaction.#executeOperation(
					operation,
					rowFilter,
					nativeAccessDeniedAsMissing,
				),
			)
		}

		const executeOperation = (): Promise<DatabaseOperationResult<TOperation>> =>
			runWithRequestEngineScope(this, () =>
				this.#pipeline.execute({
					context: this.context,
					operation,
					...(rowFilter === undefined ? {} : { rowFilter }),
					...(nativeAccessDeniedAsMissing === undefined
						? {}
						: { nativeAccessDeniedAsMissing }),
				}),
			)

		let result = await (this.#transactionLifetime === undefined
			? executeOperation()
			: this.#transactionLifetime.run(executeOperation))

		result = await resolvePointerInclusions(operation, result, {
			execute: async (targetOperation, targetRowFilter) =>
				this.#executeOperation(
					targetOperation as ExecutableOperationAst<TSchemas[number]>,
					targetRowFilter,
					true,
				),
		})

		return materializeOperationResult(operation, result)
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
		assertApplicationEngineAvailable(this.application)
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
		assertApplicationEngineAvailable(this.application)

		if (typeof handler !== 'function') {
			throw new TypeError(
				'Request engine transaction handler must be a function',
			)
		}

		throwIfOperationCancelled(this.context.signal, {
			phase: 'transaction-start',
		})

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
			this.context.signal,
		)
	}
}

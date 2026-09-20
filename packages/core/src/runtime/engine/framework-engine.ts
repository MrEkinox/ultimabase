import {
	assertFrameworkEngineOptions,
	type FrameworkEngineOptions,
} from './engine-options.js'
export type { FrameworkEngineOptions } from './engine-options.js'
import { runApplicationWork } from '../../application/active-application.js'
import type { FrameworkApplication } from '../../foundation.js'
import { FrameworkError, type PluginDefinition } from '../../foundation.js'
import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
	RequestAccess,
} from '../../access/index.js'
import type {
	ExecutableOperationAst,
	OperationResult,
} from '../../query/index.js'
import {
	registerOperationBatchExecutionHandler,
	registerOperationExecutionHandler,
	type NormalizedOperationOptions,
	type OperationBatchEntry,
	type OperationBatchProjection,
	type OperationPrivateScope,
} from '../../query/operations/execution.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { MaybePromise } from '@ultimabase/shared'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	isRequestContext,
	RequestContext,
	type RequestContextOptions,
} from '../context/request-context.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import type {
	DatabaseRelationScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	bindMasterGrantApplication,
	elevateMasterRequest,
	elevateTrustedMasterRequest,
	type MasterKeyGrant,
} from '../master/master-authority.js'
import { getOperationSchema } from '../operations/schema.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import { readRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { projectRuntimeMutationBatch } from '../pipeline/runtime-pipeline.js'
import { runRequestTransaction } from '../transactions/run-transaction.js'
import { requiresAutomaticMutationTransaction } from '../transactions/automatic-mutation.js'
import {
	createNestedTransactionError,
	type TransactionLifetime,
} from '../transactions/transaction-lifetime.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { executeRuntimeRelationMutation } from '../relations/relation-mutation.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import { exposeFrameworkOperations } from '../plugin-operations/engine-integration.js'
import { registerRequestPluginOperationHost } from '../plugin-operations/request-execution.js'
import { registerRequestSchemaMutationHost } from '../schema-mutations/request-execution.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
} from '../plugin-operations/transport.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import {
	assertApplicationEngineAvailable,
	bindRequestContextToApplication,
} from './application-binding.js'
import { registerRequestAdapterAccessContext as registerAdapterAccess } from '../adapters/request-access.js'
import {
	createMasterAuditReason,
	isProtectedPolicyDenial,
	isStrictObjectOperation,
} from './operation-boundaries.js'
import {
	assertMasterElevationPrivilege,
	bindFrameworkMasterAuthority,
	getFrameworkMasterAuthority,
	readFrameworkMasterAuthority,
} from './framework-master-authority.js'
import { registerRequestPrivateStorageContext } from '../../private-storage/runtime.js'

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

/** Retains the effective authority beside one unmaterialized terminal result. */
interface RuntimeTerminalExecution {
	readonly context: RequestContext
	readonly result: unknown
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
		assertApplicationEngineAvailable(options.application)
		this.application = options.application
		this.#pipeline = options.pipeline

		if (options.masterAuthority !== undefined) {
			bindFrameworkMasterAuthority(this, options.masterAuthority)
		}

		Object.freeze(this)
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
		registerAdapterAccess(this, pipeline, transactionLifetime)
		registerRequestPrivateStorageContext(this, pipeline, transactionLifetime)
		registerRequestPluginOperationHost({
			engine: this,
			runTransaction: (handler) => this.transaction(handler),
			...(this.#transactionLifetime === undefined
				? {}
				: { transactionLifetime: this.#transactionLifetime }),
		})
		registerRequestSchemaMutationHost({
			createContextEngine: (nextContext) =>
				new RequestEngine(
					requestEngineConstructionKey,
					this.framework,
					nextContext,
					this.#pipeline,
					this.#transactionLifetime,
				),
			engine: this,
			pipeline: this.#pipeline,
			runTransaction: (handler) => this.transaction(handler),
			...(this.#transactionLifetime === undefined
				? {}
				: { transactionLifetime: this.#transactionLifetime }),
		})
		registerOperationExecutionHandler(this, (operation, options, scope) =>
			runApplicationWork(this.application, () =>
				this.#executeTerminal(operation, options, scope),
			),
		)
		registerOperationBatchExecutionHandler(
			this,
			(entries, options, projection) =>
				runApplicationWork(this.application, () =>
					this.#executeTerminalBatch(entries, options, projection),
				),
		)

		Object.freeze(this)
	}

	/** Keeps every directed batch item inside one shared transaction lifetime. */
	async #executeTerminalBatch(
		entries: readonly OperationBatchEntry[],
		options: NormalizedOperationOptions,
		projection: OperationBatchProjection | undefined,
	): Promise<readonly unknown[]> {
		if (entries.length === 0) {
			return immutableArray([])
		}

		const executeItems = async (
			engine: RequestEngine,
		): Promise<readonly unknown[]> => {
			const results: unknown[] = []
			const objectIds: string[] = []
			let projectionContext: RequestContext | undefined

			for (const entry of entries) {
				let result: unknown

				if (projection === undefined) {
					result = await engine.#executeTerminal(
						entry.operation,
						options,
						undefined,
					)
				} else {
					const execution = await engine.#executeTerminal(
						entry.operation,
						options,
						undefined,
						true,
					)

					result = execution.result
					projectionContext = execution.context
				}

				if (entry.requireResult === true && result === null) {
					throw createProtectedObjectNotFoundError()
				}

				results.push(result)

				if (projection !== undefined) {
					if (!isPlainRecord(result)) {
						throw new TypeError(
							'Mutation batch projection requires record results',
						)
					}

					const identity = readRuntimeSchemaModelMetadata(result)?.objectId

					if (typeof identity !== 'string') {
						throw new TypeError(
							'Mutation batch result is missing its persisted object id',
						)
					}

					objectIds.push(identity)
				}
			}

			if (projection === undefined) return immutableArray(results)
			if (projectionContext === undefined) {
				throw new TypeError(
					'Mutation batch projection is missing its effective request context',
				)
			}

			const records = immutableArray(
				results.map((result) => {
					if (!isPlainRecord(result)) {
						throw new TypeError(
							'Mutation batch projection requires record results',
						)
					}

					return result
				}),
			)
			const projected = await projectRuntimeMutationBatch(engine.#pipeline, {
				context: projectionContext,
				objectIds: immutableArray(objectIds),
				operation: projection.operation,
				results: records,
			})

			return immutableArray(
				projected.map((result, index) => {
					const entry = entries[index]

					if (entry === undefined) {
						throw new TypeError(
							'Mutation batch projection lost its operation entry',
						)
					}

					const operation = entry.operation as ExecutableOperationAst
					const projectedOperation: ExecutableOperationAst =
						operation.kind === 'create-one'
							? immutableRecord({
									...operation,
									inclusion: projection.operation.query.inclusion,
								})
							: operation.kind === 'update-one'
								? immutableRecord({
										...operation,
										query: immutableRecord({
											...operation.query,
											inclusion: projection.operation.query.inclusion,
										}),
									})
								: operation

					return materializeOperationResult(
						projectedOperation,
						result as RuntimeOperationResult<typeof projectedOperation>,
					)
				}),
			)
		}

		if (this.#transactionLifetime !== undefined) {
			return executeItems(this)
		}

		return this.transaction((transaction) => executeItems(transaction))
	}

	/** Resolves trusted terminal authority while retaining this engine's lifetime. */
	async #executeTerminal(
		operation: unknown,
		options: NormalizedOperationOptions,
		scope: OperationPrivateScope | undefined,
		returnRuntimeResult: true,
	): Promise<RuntimeTerminalExecution>
	async #executeTerminal(
		operation: unknown,
		options: NormalizedOperationOptions,
		scope: OperationPrivateScope | undefined,
		returnRuntimeResult?: undefined,
	): Promise<unknown>
	async #executeTerminal(
		operation: unknown,
		options: NormalizedOperationOptions,
		scope: OperationPrivateScope | undefined,
		returnRuntimeResult?: true,
	): Promise<unknown> {
		const normalizedOperation = operation as ExecutableOperationAst<
			TSchemas[number]
		>
		const schema = getOperationSchema(normalizedOperation)
		let relationScope: DatabaseRelationScope | undefined

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

			relationScope = immutableRecord({
				fieldPath: immutableArray(scope.fieldPath),
				source: scope.source,
				sourceObjectId: scope.sourceObjectId,
				target: scope.target,
			})
		}

		let context: RequestContext = this.context

		if (options.context !== undefined) {
			if (!isRequestContext(options.context)) {
				throw new TypeError(
					'operation context must be a RequestContext instance',
				)
			}

			bindRequestContextToApplication(
				this.framework.application,
				options.context,
				readFrameworkMasterAuthority(this.framework),
			)
			context = options.context
		}

		if (options.useMasterKey) {
			assertMasterElevationPrivilege(this.framework.application)
			context = await elevateTrustedMasterRequest(
				getFrameworkMasterAuthority(this.framework),
				context,
				createMasterAuditReason(normalizedOperation, schema),
				this.framework.application,
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

		// Structural normalization guarantees an executable operation for this schema.
		const rowFilter = scope?.kind === 'row-filter' ? scope.rowFilter : undefined
		const deniedAsMissing =
			scope?.kind === 'row-filter'
				? scope.protectedPolicyDeniedAsMissing
				: undefined
		const objectId = scope?.kind === 'row-filter' ? scope.objectId : undefined

		if (returnRuntimeResult === true) {
			return immutableRecord({
				context: engine.context,
				result: await engine.#executeRuntimeOperation(
					normalizedOperation,
					rowFilter,
					deniedAsMissing,
					objectId,
					relationScope,
				),
			})
		}

		return engine.#executeOperation(
			normalizedOperation,
			rowFilter,
			deniedAsMissing,
			objectId,
			relationScope,
		)
	}

	get application(): FrameworkApplication<TSchemas, TPlugins> {
		return this.framework.application
	}

	/** Executes a normalized operation through this request's mandatory pipeline. */
	async execute<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(operation: TOperation): Promise<OperationResult<TOperation>> {
		return runApplicationWork(this.application, () =>
			this.#executeOperation(operation),
		)
	}

	/** Executes public and framework-scoped operations through one shared lifecycle. */
	async #executeOperation<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(
		operation: TOperation,
		rowFilter?: DatabaseRowFilterNode,
		protectedPolicyDeniedAsMissing?: true,
		privateObjectId?: string,
		relationScope?: DatabaseRelationScope,
	): Promise<OperationResult<TOperation>> {
		const result = await this.#executeRuntimeOperation(
			operation,
			rowFilter,
			protectedPolicyDeniedAsMissing,
			privateObjectId,
			relationScope,
		)

		return materializeOperationResult(operation, result)
	}

	/** Runs one complete lifecycle while retaining its unmaterialized Runtime result. */
	async #executeRuntimeOperation<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(
		operation: TOperation,
		rowFilter?: DatabaseRowFilterNode,
		protectedPolicyDeniedAsMissing?: true,
		privateObjectId?: string,
		relationScope?: DatabaseRelationScope,
	): Promise<RuntimeOperationResult<TOperation>> {
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
			return this.transaction(async (transaction) => {
				let result: RuntimeOperationResult<TOperation>

				try {
					result = await transaction.#executeRuntimeOperation(
						operation,
						rowFilter,
						protectedPolicyDeniedAsMissing,
						privateObjectId,
						relationScope,
					)
				} catch (error: unknown) {
					if (
						protectedPolicyDeniedAsMissing === true &&
						isStrictObjectOperation(operation) &&
						isProtectedPolicyDenial(error)
					) {
						throw createProtectedObjectNotFoundError()
					}

					throw error
				}

				if (
					protectedPolicyDeniedAsMissing === true &&
					isStrictObjectOperation(operation) &&
					result === null
				) {
					throw createProtectedObjectNotFoundError()
				}

				return result
			})
		}

		const mutationRelationScope = await executeRuntimeRelationMutation(
			operation,
			privateObjectId,
			{
				assertOwnsSchema: (schema) => {
					this.framework.assertOwnsSchema(schema)
				},
				execute: (
					nestedOperation,
					nestedRowFilter,
					deniedAsMissing,
					objectId,
				) =>
					this.#executeOperation(
						nestedOperation as unknown as ExecutableOperationAst<
							TSchemas[number]
						>,
						nestedRowFilter,
						deniedAsMissing,
						objectId,
					),
				getSchemaTargets: () => this.framework.application.schemaTargets,
			},
		)
		const databaseRelationScope = mutationRelationScope ?? relationScope

		const executeOperation = (): Promise<RuntimeOperationResult<TOperation>> =>
			runWithRequestEngineScope(this, () =>
				this.#pipeline.execute({
					context: this.context,
					operation,
					...(databaseRelationScope === undefined
						? {}
						: { relation: databaseRelationScope }),
					...(rowFilter === undefined ? {} : { rowFilter }),
					...(protectedPolicyDeniedAsMissing === undefined
						? {}
						: { protectedPolicyDeniedAsMissing }),
				}),
			)

		let result: RuntimeOperationResult<TOperation>

		try {
			result = await (this.#transactionLifetime === undefined
				? executeOperation()
				: this.#transactionLifetime.run(executeOperation))
		} catch (error: unknown) {
			if (
				protectedPolicyDeniedAsMissing === true &&
				isStrictObjectOperation(operation) &&
				isProtectedPolicyDenial(error)
			) {
				throw createProtectedObjectNotFoundError()
			}

			throw error
		}

		return result
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
		assertMasterElevationPrivilege(this.application)

		return runApplicationWork(this.application, async () => {
			const masterContext = await elevateMasterRequest(
				getFrameworkMasterAuthority(this.framework),
				grant,
				this.context,
				reason,
				this.framework.application,
			)

			return new RequestEngine(
				requestEngineConstructionKey,
				this.framework,
				masterContext,
				this.#pipeline,
				this.#transactionLifetime,
			)
		})
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
			const error = createNestedTransactionError()

			this.#transactionLifetime.markFailed(error)
			throw error
		}

		return runApplicationWork(this.application, () =>
			runRequestTransaction(
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
			),
		)
	}
}

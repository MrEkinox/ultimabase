import { runApplicationWork } from '../../application/active-application.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import { FrameworkError, type PluginDefinition } from '../../foundation.js'
import type { MasterRequestAccess } from '../../access/index.js'
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
import type { SchemaDefinition } from '../../schema/index.js'
import type { MaybePromise } from '@ultimabase/shared'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	isRequestContext,
	type RequestContext,
} from '../context/request-context.js'
import { runWithRequestEngineScope } from '../context/active-framework-storage.js'
import type {
	DatabaseRelationScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	elevateMasterRequest,
	elevateTrustedMasterRequest,
	type MasterKeyGrant,
} from '../master/master-authority.js'
import { getOperationSchema } from '../operations/schema.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { runRequestTransaction } from '../transactions/run-transaction.js'
import {
	createNestedTransactionError,
	type TransactionLifetime,
} from '../transactions/transaction-lifetime.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { executeRuntimeRelationMutation } from '../relations/relation-mutation.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import { registerRequestPluginOperationHost } from '../plugin-operations/request-execution.js'
import { registerRequestSchemaMutationHost } from '../schema-mutations/request-execution.js'
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
	getFrameworkMasterAuthority,
	readFrameworkMasterAuthority,
} from './framework-master-authority.js'
import { registerRequestPrivateStorageContext } from '../../private-storage/runtime.js'

import {
	executeRequestTerminalBatch,
	type RuntimeTerminalExecution,
} from './request-engine-batch.js'
import type { FrameworkEngine } from './framework-engine.js'
import { requestEngineConstructionKey } from './request-engine-construction.js'
import type { UltimaBase } from '../application/ultima-base.js'

type RequestEngineOwner = Readonly<{
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>
	framework: FrameworkEngine
}>

const requestEngineOwners = new WeakMap<object, RequestEngineOwner>()

/** Receives one transaction-scoped engine while preserving its exact context type. */
export type RequestTransactionHandler<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
	TContext extends RequestContext,
	TResult,
> = (
	engine: RequestEngine<TSchemas, TPlugins, TContext>,
) => MaybePromise<TResult>

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
	readonly #application: FrameworkApplication<TSchemas, TPlugins>
	readonly #framework: FrameworkEngine<TSchemas, TPlugins>
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

		this.#application = framework.application
		this.#framework = framework
		requestEngineOwners.set(this, {
			application: framework.application,
			framework,
		})
		this.context = context
		this.#pipeline = pipeline
		this.#transactionLifetime = transactionLifetime
		registerAdapterAccess(this, pipeline, transactionLifetime)
		registerRequestPrivateStorageContext(this, pipeline, transactionLifetime)
		const transactionHost = {
			runTransaction: (handler: (engine: RequestEngine) => Promise<unknown>) =>
				this.transaction(handler),
			...(transactionLifetime === undefined ? {} : { transactionLifetime }),
		}
		registerRequestPluginOperationHost({
			engine: this,
			...transactionHost,
		})
		registerRequestSchemaMutationHost({
			createContextEngine: (nextContext) => this.#derive(nextContext),
			engine: this,
			pipeline: this.#pipeline,
			...transactionHost,
		})
		registerOperationExecutionHandler(this, (operation, options, scope) =>
			runApplicationWork(this.#application, () =>
				this.#executeTerminal(operation, options, scope),
			),
		)
		registerOperationBatchExecutionHandler(
			this,
			(entries, options, projection) =>
				runApplicationWork(this.#application, () =>
					this.#executeTerminalBatch(entries, options, projection),
				),
		)

		Object.freeze(this)
	}

	/** Returns the sole public application owner for this request. */
	get ultimabase(): UltimaBase<TSchemas, TPlugins> {
		return this.#framework.ultimabase
	}

	/** Derives one request engine without duplicating its private ownership wiring. */
	#derive<TNextContext extends RequestContext>(
		context: TNextContext,
		pipeline: RuntimePipeline = this.#pipeline,
		transactionLifetime: TransactionLifetime | undefined = this
			.#transactionLifetime,
	): RequestEngine<TSchemas, TPlugins, TNextContext> {
		return new RequestEngine(
			requestEngineConstructionKey,
			this.#framework,
			context,
			pipeline,
			transactionLifetime,
		)
	}

	/** Keeps every directed batch item inside one shared transaction lifetime. */
	async #executeTerminalBatch(
		entries: readonly OperationBatchEntry[],
		options: NormalizedOperationOptions,
		projection: OperationBatchProjection | undefined,
	): Promise<readonly unknown[]> {
		if (entries.length === 0) return immutableArray([])

		const executeItems = (engine: RequestEngine): Promise<readonly unknown[]> =>
			executeRequestTerminalBatch(
				entries,
				options,
				projection,
				engine.#pipeline,
				{
					execute: (operation, itemOptions) =>
						engine.#executeTerminal(operation, itemOptions, undefined),
					executeWithRuntime: (operation, itemOptions) =>
						engine.#executeTerminal(operation, itemOptions, undefined, true),
				},
			)

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

		this.#framework.assertOwnsSchema(schema)

		if (scope?.kind === 'relation') {
			this.#framework.assertOwnsSchema(scope.source)
			const relation = this.#application.schemaTargets.getRelation(
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
				this.#application,
				options.context,
				readFrameworkMasterAuthority(this.#framework),
			)
			context = options.context
		}

		if (options.useMasterKey) {
			assertMasterElevationPrivilege(this.#application)
			context = await elevateTrustedMasterRequest(
				getFrameworkMasterAuthority(this.#framework),
				context,
				createMasterAuditReason(normalizedOperation, schema),
				this.#application,
			)
		}

		const engine = context === this.context ? this : this.#derive(context)

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

	/** Executes a normalized operation through this request's mandatory pipeline. */
	async execute<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(operation: TOperation): Promise<OperationResult<TOperation>> {
		return runApplicationWork(this.#application, () =>
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
		this.#framework.assertOwnsSchema(getOperationSchema(operation))
		throwIfOperationCancelled(this.context.signal, {
			operationKind: operation.kind,
			phase: 'request-engine',
		})

		if (
			this.#transactionLifetime === undefined &&
			isRuntimeMutationOperation(operation)
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
					this.#framework.assertOwnsSchema(schema)
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
				getSchemaTargets: () => this.#application.schemaTargets,
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
		assertApplicationEngineAvailable(this.#application)
		this.#transactionLifetime?.assertActive()
		assertMasterElevationPrivilege(this.#application)

		return runApplicationWork(this.#application, async () => {
			const masterContext = await elevateMasterRequest(
				getFrameworkMasterAuthority(this.#framework),
				grant,
				this.context,
				reason,
				this.#application,
			)

			return this.#derive(masterContext)
		})
	}

	/** Opens one adapter transaction while preserving this context and application. */
	transaction<TResult>(
		handler: RequestTransactionHandler<TSchemas, TPlugins, TContext, TResult>,
	): Promise<TResult> {
		assertApplicationEngineAvailable(this.#application)
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

		return runApplicationWork(this.#application, () =>
			runRequestTransaction(
				this.#pipeline,
				(transactionPipeline, lifetime) =>
					this.#derive(this.context, transactionPipeline, lifetime),
				(transaction) =>
					runWithRequestEngineScope(transaction, () => handler(transaction)),
				this.context.signal,
			),
		)
	}
}

/** @internal Reads the private application kernel owning one request engine. */
export const readRequestEngineApplication = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	engine: RequestEngine<TSchemas, TPlugins>,
): FrameworkApplication<TSchemas, TPlugins> => {
	const owner = requestEngineOwners.get(engine)
	if (owner === undefined)
		throw new TypeError('Request engine owner is unavailable')
	return owner.application as FrameworkApplication<TSchemas, TPlugins>
}

/** @internal Reads the private framework engine owning one request engine. */
export const readRequestEngineFramework = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	engine: RequestEngine<TSchemas, TPlugins>,
): FrameworkEngine<TSchemas, TPlugins> => {
	const owner = requestEngineOwners.get(engine)
	if (owner === undefined)
		throw new TypeError('Request engine owner is unavailable')
	return owner.framework as FrameworkEngine<TSchemas, TPlugins>
}

import {
	assertApplicationExecution,
	runApplicationWork,
} from '../../application/active-application.js'
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
	type OperationPrivateScope,
} from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import { runWithRequestEngineScope } from '../context/active-framework-context.js'
import type {
	DatabaseRelationScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	elevateMasterRequest,
	type MasterKeyGrant,
} from '../master/master-authority.js'
import { getOperationSchema } from '../operations/schema.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import {
	createNestedTransactionError,
	runAutomaticRequestTransaction,
	runRequestTransaction,
	type AutomaticTransactionLabel,
	type TransactionLifetime,
} from '../transactions/run-transaction.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { executeRuntimeRelationMutation } from '../relations/relation-mutation.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import {
	assertMasterElevationPrivilege,
	requireMasterAuthority,
	resolveTerminalContext,
} from './application-binding.js'
import { executeRequestTerminalBatch } from './request-engine-batch.js'
import {
	readFrameworkMasterAuthority,
	type FrameworkEngine,
} from './framework-engine.js'
import type { UltimaBase } from '../application/ultima-base.js'

/** Only the owning framework can construct request engines. */
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

/** Framework-owned restrictions that never enter a transformable operation AST. */
interface PrivateOperationScope {
	readonly deniedAsMissing?: true | undefined
	readonly objectId?: string | undefined
	readonly relation?: DatabaseRelationScope | undefined
	readonly rowFilter?: DatabaseRowFilterNode | undefined
}

/** Core-only view of one engine's private execution state. */
export interface RequestEngineInternals {
	readonly application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>
	readonly framework: FrameworkEngine
	readonly lifetime: TransactionLifetime | undefined
	readonly pipeline: RuntimePipeline
	/** Derives one engine with another context and this engine's transaction lifetime. */
	readonly derive: (context: RequestContext) => RequestEngine
	/** Opens one automatic mutation transaction retried on transient conflicts. */
	readonly automaticTransaction: <TResult>(
		label: AutomaticTransactionLabel,
		handler: (engine: RequestEngine) => MaybePromise<TResult>,
	) => Promise<TResult>
}

let readInternals: (engine: RequestEngine) => RequestEngineInternals
let readFramework: <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	engine: RequestEngine<TSchemas, TPlugins>,
) => FrameworkEngine<TSchemas, TPlugins>

/** Hides whether a strict protected target was absent or denied by policy. */
const asMissing = (error: unknown, strictMissing: boolean): unknown =>
	strictMissing && isProtectedPolicyDenied(error)
		? createProtectedObjectNotFoundError()
		: error

/** Names an operation's schema in retry diagnostics without reading values. */
const readOperationSchemaName = (operation: unknown): string | undefined => {
	if (operation === undefined) return undefined
	const schema: unknown = getOperationSchema(operation)
	return (typeof schema === 'object' || typeof schema === 'function') &&
		schema !== null &&
		'className' in schema &&
		typeof schema.className === 'string'
		? schema.className
		: undefined
}

const isStrictObjectOperation = (operation: ExecutableOperationAst): boolean =>
	operation.kind === 'get' ||
	operation.kind === 'update-one' ||
	operation.kind === 'delete-one'

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
	readonly #framework: FrameworkEngine<TSchemas, TPlugins>
	readonly #pipeline: RuntimePipeline
	readonly #lifetime: TransactionLifetime | undefined

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

		this.context = context
		this.#framework = framework
		this.#pipeline = pipeline
		this.#lifetime = transactionLifetime
		const application = framework.application
		registerOperationExecutionHandler(this, (operation, options, scope) =>
			runApplicationWork(application, async () => {
				const terminal = await this.#prepareTerminal(operation, options, scope)
				return terminal.engine.#executeOperation(
					terminal.operation,
					terminal.scope,
				)
			}),
		)
		registerOperationBatchExecutionHandler(
			this,
			(entries, options, projection) =>
				runApplicationWork(application, async () => {
					if (entries.length === 0) return immutableArray([])
					const executeItems = (engine: RequestEngine<TSchemas, TPlugins>) =>
						executeRequestTerminalBatch(entries, projection, engine.#pipeline, {
							execute: async (operation) => {
								const item = await engine.#prepareTerminal(operation, options)
								return item.engine.#executeOperation(item.operation, item.scope)
							},
							executeWithRuntime: async (operation) => {
								const item = await engine.#prepareTerminal(operation, options)
								return immutableRecord({
									context: item.engine.context,
									result: await item.engine.#executeRuntimeOperation(
										item.operation,
										item.scope,
									),
								})
							},
						})
					const [first] = entries
					return this.#lifetime === undefined
						? this.#openTransaction(executeItems, {
								operation: 'collection-command',
								schema: readOperationSchemaName(first?.operation),
							})
						: executeItems(this)
				}),
		)

		Object.freeze(this)
	}

	/** Returns the sole public application owner for this request. */
	get ultimabase(): UltimaBase<TSchemas, TPlugins> {
		return this.#framework.ultimabase
	}

	get #application(): FrameworkApplication<TSchemas, TPlugins> {
		return this.#framework.application
	}

	/** Derives one request engine without duplicating its private ownership wiring. */
	#derive<TNextContext extends RequestContext>(
		context: TNextContext,
		pipeline = this.#pipeline,
		lifetime = this.#lifetime,
	): RequestEngine<TSchemas, TPlugins, TNextContext> {
		return new RequestEngine(
			requestEngineConstructionKey,
			this.#framework,
			context,
			pipeline,
			lifetime,
		)
	}

	/** Resolves trusted terminal authority while retaining this engine's lifetime. */
	async #prepareTerminal(
		operation: unknown,
		options: NormalizedOperationOptions,
		scope?: OperationPrivateScope,
	): Promise<{
		readonly engine: RequestEngine<TSchemas, TPlugins>
		readonly operation: ExecutableOperationAst<TSchemas[number]>
		readonly scope: PrivateOperationScope
	}> {
		// Structural normalization guarantees an executable operation for this schema.
		const executable = operation as ExecutableOperationAst<TSchemas[number]>
		const schema = getOperationSchema(executable)
		this.#framework.assertOwnsSchema(schema)

		let relation: DatabaseRelationScope | undefined
		if (scope?.kind === 'relation') {
			this.#framework.assertOwnsSchema(scope.source)
			const mapping = this.#application.schemaTargets.getRelation(
				scope.source,
				scope.fieldPath,
			)
			if (mapping?.target !== schema || scope.target !== schema) {
				throw new FrameworkError(
					'VALIDATION_ERROR',
					'Relation query scope does not match the executed target schema.',
					{ publicMessage: 'The requested relation is not available.' },
				)
			}
			relation = immutableRecord({
				fieldPath: immutableArray(scope.fieldPath),
				source: scope.source,
				sourceObjectId: scope.sourceObjectId,
				target: scope.target,
			})
		}

		const context = await resolveTerminalContext(
			this.#application,
			readFrameworkMasterAuthority(this.#framework),
			this.context,
			options,
			() => `Schema command ${executable.kind} on ${schema.className}`,
		)
		const rowFilter = scope?.kind === 'row-filter' ? scope : undefined
		return {
			engine: context === this.context ? this : this.#derive(context),
			operation: executable,
			scope: {
				deniedAsMissing: rowFilter?.protectedPolicyDeniedAsMissing,
				objectId: rowFilter?.objectId,
				relation,
				rowFilter: rowFilter?.rowFilter,
			},
		}
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
		scope: PrivateOperationScope = {},
	): Promise<OperationResult<TOperation>> {
		return materializeOperationResult(
			operation,
			await this.#executeRuntimeOperation(operation, scope),
		)
	}

	/** Runs one complete lifecycle while retaining its unmaterialized Runtime result. */
	async #executeRuntimeOperation<
		const TOperation extends ExecutableOperationAst<TSchemas[number]>,
	>(
		operation: TOperation,
		scope: PrivateOperationScope,
	): Promise<RuntimeOperationResult<TOperation>> {
		this.#framework.assertOwnsSchema(getOperationSchema(operation))
		throwIfOperationCancelled(this.context.signal, {
			operationKind: operation.kind,
			phase: 'request-engine',
		})
		const strictMissing =
			scope.deniedAsMissing === true && isStrictObjectOperation(operation)

		if (this.#lifetime === undefined && isRuntimeMutationOperation(operation)) {
			// Every root mutation reuses the exact public transaction lifecycle, and
			// a hidden strict target fails inside it so the transaction rolls back.
			const label = {
				operation: operation.kind,
				schema: readOperationSchemaName(operation),
			}
			return this.#openTransaction(async (transaction) => {
				let result: RuntimeOperationResult<TOperation>
				try {
					result = await transaction.#executeRuntimeOperation(operation, scope)
				} catch (error: unknown) {
					throw asMissing(error, strictMissing)
				}
				if (strictMissing && result === null) {
					throw createProtectedObjectNotFoundError()
				}
				return result
			}, label)
		}

		const relation =
			(await executeRuntimeRelationMutation(operation, scope.objectId, {
				assertOwnsSchema: (schema) => {
					this.#framework.assertOwnsSchema(schema)
				},
				execute: (nested, rowFilter, deniedAsMissing, objectId) =>
					this.#executeOperation(
						nested as unknown as ExecutableOperationAst<TSchemas[number]>,
						{ deniedAsMissing, objectId, rowFilter },
					),
				getSchemaTargets: () => this.#application.schemaTargets,
			})) ?? scope.relation
		const execute = (): Promise<RuntimeOperationResult<TOperation>> =>
			runWithRequestEngineScope(this, () =>
				this.#pipeline.execute({
					context: this.context,
					operation,
					...(relation === undefined ? {} : { relation }),
					...(scope.rowFilter === undefined
						? {}
						: { rowFilter: scope.rowFilter }),
					...(scope.deniedAsMissing === undefined
						? {}
						: { protectedPolicyDeniedAsMissing: scope.deniedAsMissing }),
				}),
			)

		try {
			return await (this.#lifetime === undefined
				? execute()
				: this.#lifetime.run(execute))
		} catch (error: unknown) {
			throw asMissing(error, strictMissing)
		}
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
		assertApplicationExecution(this.#application)
		this.#lifetime?.assertActive()
		assertMasterElevationPrivilege(this.#application)

		return runApplicationWork(this.#application, async () =>
			this.#derive(
				await elevateMasterRequest(
					requireMasterAuthority(readFrameworkMasterAuthority(this.#framework)),
					grant,
					this.context,
					reason,
					this.#application,
				),
			),
		)
	}

	/** Opens one adapter transaction while preserving this context and application. */
	transaction<TResult>(
		handler: RequestTransactionHandler<TSchemas, TPlugins, TContext, TResult>,
	): Promise<TResult> {
		return this.#openTransaction(handler, undefined)
	}

	/**
	 * Opens the explicit transaction (`label` absent, never replayed) or one
	 * automatic mutation transaction retried on transient conflicts (ADR-0300).
	 */
	#openTransaction<TResult>(
		handler: RequestTransactionHandler<TSchemas, TPlugins, TContext, TResult>,
		label: AutomaticTransactionLabel | undefined,
	): Promise<TResult> {
		assertApplicationExecution(this.#application)
		if (typeof handler !== 'function') {
			throw new TypeError(
				'Request engine transaction handler must be a function',
			)
		}
		throwIfOperationCancelled(this.context.signal, {
			phase: 'transaction-start',
		})
		if (this.#lifetime !== undefined) {
			this.#lifetime.assertActive()
			const error = createNestedTransactionError()
			this.#lifetime.markFailed(error)
			throw error
		}

		const createEngine = (
			pipeline: RuntimePipeline,
			lifetime: TransactionLifetime,
		): RequestEngine<TSchemas, TPlugins, TContext> =>
			this.#derive(this.context, pipeline, lifetime)
		const run = (
			transaction: RequestEngine<TSchemas, TPlugins, TContext>,
		): MaybePromise<TResult> =>
			runWithRequestEngineScope(transaction, () => handler(transaction))

		return runApplicationWork(this.#application, () =>
			label === undefined
				? runRequestTransaction(
						this.#pipeline,
						createEngine,
						run,
						this.context.signal,
					)
				: runAutomaticRequestTransaction(
						this.#pipeline,
						createEngine,
						run,
						this.context.signal,
						label,
					),
		)
	}

	static {
		readFramework = (engine) => {
			// A forged prototype passes `instanceof` but owns no private state.
			if (!(#framework in engine)) {
				throw new TypeError('Request engine owner is unavailable')
			}
			return engine.#framework
		}
		readInternals = (engine) => ({
			application: readFramework(engine).application,
			automaticTransaction: (label, handler) =>
				engine.#openTransaction(handler, label),
			framework: engine.#framework,
			lifetime: engine.#lifetime,
			pipeline: engine.#pipeline,
			derive: (context) => engine.#derive(context),
		})
	}
}

/** @internal Lets the owning framework construct one request engine. */
export const createRequestEngine = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
	TContext extends RequestContext,
>(
	framework: FrameworkEngine<TSchemas, TPlugins>,
	context: TContext,
	pipeline: RuntimePipeline,
): RequestEngine<TSchemas, TPlugins, TContext> =>
	new RequestEngine(requestEngineConstructionKey, framework, context, pipeline)

/** @internal Reads the private state used by Core-owned request extensions. */
export const readRequestEngineInternals = (
	engine: RequestEngine,
): RequestEngineInternals => readInternals(engine)

/** @internal Reads the private framework engine owning one request engine. */
export const readRequestEngineFramework = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	engine: RequestEngine<TSchemas, TPlugins>,
): FrameworkEngine<TSchemas, TPlugins> => readFramework(engine)

/** @internal Reads the private application kernel owning one request engine. */
export const readRequestEngineApplication = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	engine: RequestEngine<TSchemas, TPlugins>,
): FrameworkApplication<TSchemas, TPlugins> => readFramework(engine).application

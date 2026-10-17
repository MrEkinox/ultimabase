import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import type {
	CreateOneOperationAst,
	UpdateOneOperationAst,
} from '../../query/operations/contracts.js'
import type { NestedWriteObjectNode } from '../../schema/nested-writes/contracts.js'
import { readNestedWriteRootOperation } from '../../schema/nested-writes/operation-markers.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseRelationScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import { createRuntimeBehaviorBoundaries } from '../behaviors/validation-boundaries.js'
import { assertSchemaCommandOpen } from './closed-commands.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'
import { verifyRuntimeLinkTargets } from '../nested-writes/link-targets.js'
import {
	inheritRuntimeNestedWrites,
	readRuntimeNestedWrites,
} from '../nested-writes/binding.js'
import {
	createRuntimeNestedWriteStageContext,
	runWithRuntimeNestedWriteStageContext,
} from '../nested-writes/execution-context.js'
import { RuntimeNestedWriteCoordinator } from '../nested-writes/execution.js'
import { readNestedMutationOutcomeId } from '../nested-writes/outcome.js'
import {
	createRuntimeNestedCreateOperation,
	createRuntimeNestedUpdateOperation,
	prepareRuntimeNestedWriteGraph,
} from '../nested-writes/preparation.js'
import {
	readReservedCreateId,
	retainReservedCreateId,
} from '../nested-writes/reserved-create.js'
import { createRuntimeNestedWriteHost } from '../nested-writes/runtime-host.js'
import {
	beginPipelineTransaction,
	type RuntimePipelineTransactionScope,
} from '../transactions/pipeline-transaction.js'
import {
	createRuntimeRelationFilterResolver,
	createRuntimeVirtualFieldScheduler,
	inheritRuntimeRelationFilters,
	inheritRuntimeVirtualFields,
} from './application-bindings.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import { registerRuntimeSchemaMutationPipeline } from '../schema-mutations/execution-support.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import { prepareBoundRuntimeVirtualFieldProjection } from '../virtual-fields/pipeline.js'
import {
	runtimeBehaviorStageNames,
	type RuntimeOperationResult,
	type RuntimePipelineRequest,
	type RuntimePipelineStages,
} from './contracts.js'
import { executeRuntimeDatabaseOperation } from './database-execution.js'
import { validateRuntimeStructure } from './structural-validation.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import {
	RuntimeInclusionProjector,
	type RuntimeMutationBatchProjectionRequest,
} from './inclusion-projection.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import {
	createRuntimeOperationInput,
	enforceRuntimeOperation,
} from './stage-inputs.js'
import { finalizeRuntimeOperationResult } from './result-finalization.js'
import { bindRuntimePolicyQuery } from '../enforcement/policy-query-binding.js'
import { prepareReadableResultHooks } from '../enforcement/readable-results.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Identifies one Core-owned nested mutation while it uses the ordinary pipeline. */
interface ActiveNestedWrite {
	readonly coordinator: RuntimeNestedWriteCoordinator
	readonly node: NestedWriteObjectNode
}

/** Shares one bounded virtual scheduler and relation cache across a root operation. */
interface RuntimeOperationScope {
	readonly nested: ActiveNestedWrite | undefined
	readonly nestedChild?: true
	readonly relationFilters: RuntimeRelationFilterResolver | undefined
	readonly virtualFields: RuntimeVirtualFieldScheduler | undefined
}

type RuntimeMutationBatchProjector = (
	request: RuntimeMutationBatchProjectionRequest,
) => Promise<readonly Readonly<Record<string, unknown>>[]>

const mutationBatchProjectors = new WeakMap<
	RuntimePipeline,
	RuntimeMutationBatchProjector
>()

/** Executes one Runtime-owned grouped projection without widening the class API. */
export const projectRuntimeMutationBatch = (
	pipeline: RuntimePipeline,
	request: RuntimeMutationBatchProjectionRequest,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const projector = mutationBatchProjectors.get(pipeline)

	if (projector === undefined) {
		throw new TypeError('Runtime mutation batch projector is unavailable')
	}

	return projector(request)
}

/** Requires every listed member to be a function, or only present ones when optional. */
const assertStageFunctions = (
	stages: Readonly<Record<string, unknown>>,
	names: readonly string[],
	label: string,
	optional = false,
): void => {
	for (const name of names) {
		const stage = stages[name]
		if ((!optional || stage !== undefined) && typeof stage !== 'function') {
			throw new TypeError(`${label} ${name} must be a function`)
		}
	}
}

/** Rejects incomplete JavaScript assembly before an operation can start. */
const assertRuntimePipelineStages = (stages: RuntimePipelineStages): void => {
	const untrustedStages: unknown = stages

	assertPlainObject(
		untrustedStages,
		'Runtime pipeline stages must be a plain object',
	)

	assertStageFunctions(
		untrustedStages,
		[
			'normalization',
			'structuralValidation',
			'finalMutationValidation',
			'commit',
		],
		'Runtime pipeline stage',
	)

	const { behaviors, enforcement }: Record<string, unknown> = untrustedStages

	if (behaviors !== undefined) {
		assertPlainObject(
			behaviors,
			'Runtime pipeline behaviors must be a plain object',
		)
		assertStageFunctions(
			behaviors,
			runtimeBehaviorStageNames,
			'Runtime behavior stage',
			true,
		)
	}

	if (enforcement !== undefined) {
		assertPlainObject(
			enforcement,
			'Runtime pipeline enforcement must be a plain object',
		)
		assertStageFunctions(
			enforcement,
			[
				'enforceOperation',
				'enforceResult',
				'enforceSelectionResult',
				'evaluate',
				'reevaluate',
			],
			'Runtime enforcement stage',
		)
		assertStageFunctions(
			enforcement,
			[
				'enforceMutationOutcome',
				'enforcePreparedMutation',
				'enforceRelationRead',
			],
			'Runtime enforcement stage',
			true,
		)
	}

	const databaseOperation: unknown = untrustedStages.databaseOperation

	if (
		typeof databaseOperation !== 'object' ||
		databaseOperation === null ||
		!('execute' in databaseOperation) ||
		typeof databaseOperation.execute !== 'function'
	) {
		throw new TypeError(
			'Runtime pipeline databaseOperation must be an operation executor',
		)
	}

	assertStageFunctions(
		untrustedStages,
		['persistencePlanRewrite'],
		'Runtime pipeline stage',
		true,
	)
}

const singularProtectedKinds = new Set([
	'find-one',
	'get',
	'exists',
	'update-one',
	'delete-one',
])

/**
 * Executes every operation through one fixed security and transaction order.
 * Framework errors intentionally cross this boundary unchanged for transports.
 */
export class RuntimePipeline {
	readonly #stages: Readonly<RuntimePipelineStages>
	readonly #resultBoundaries = createRuntimeBehaviorBoundaries()
	readonly #inclusionProjector: RuntimeInclusionProjector

	constructor(stages: RuntimePipelineStages) {
		assertRuntimePipelineStages(stages)

		this.#stages = immutableRecord({
			...stages,
			...(stages.behaviors === undefined
				? {}
				: { behaviors: immutableRecord(stages.behaviors) }),
			...(stages.enforcement === undefined
				? {}
				: { enforcement: immutableRecord(stages.enforcement) }),
		})
		this.#inclusionProjector = new RuntimeInclusionProjector(
			this.#stages,
			this.#resultBoundaries,
		)
		registerRuntimeSchemaMutationPipeline(this, {
			boundaries: this.#resultBoundaries,
			inclusions: this.#inclusionProjector,
			stages: this.#stages,
		})
		bindRuntimePolicyQuery(this, this.#stages)
		mutationBatchProjectors.set(this, (request) =>
			this.#inclusionProjector.projectMutationBatch(
				request,
				createRuntimeVirtualFieldScheduler(this),
				createRuntimeRelationFilterResolver(this),
			),
		)

		// Pipeline configuration cannot change after application initialization.
		Object.freeze(this)
	}

	/**
	 * Reuses every enforcement and behavior stage with one isolated transaction adapter.
	 * Per-operation post-commit effects remain deferred until the outer commit.
	 */
	async beginTransaction(): Promise<RuntimePipelineTransactionScope> {
		const scope = await beginPipelineTransaction(
			this.#stages,
			(stages) => new RuntimePipeline(stages),
		)
		inheritRuntimeNestedWrites(this, scope.pipeline)
		inheritRuntimeVirtualFields(this, scope.pipeline)
		inheritRuntimeRelationFilters(this, scope.pipeline)
		return scope
	}

	async execute<const TOperation extends DatabaseOperationAst>(
		request: RuntimePipelineRequest<TOperation>,
	): Promise<RuntimeOperationResult<TOperation>> {
		const untrustedRequest: unknown = request

		assertPlainObject(
			untrustedRequest,
			'Runtime pipeline request must be a plain object',
		)

		if (!(untrustedRequest.context instanceof RequestContext)) {
			throw new TypeError('Runtime pipeline context must be a RequestContext')
		}

		const { context, operation } = request
		if (
			request.protectedPolicyDeniedAsMissing === true &&
			!singularProtectedKinds.has(operation.kind)
		) {
			throw new TypeError(
				'Runtime protectedPolicyDeniedAsMissing requires a singular protected operation',
			)
		}

		throwIfOperationCancelled(context.signal, {
			operationKind: operation.kind,
			phase: 'pipeline-start',
		})
		const virtualFields = createRuntimeVirtualFieldScheduler(this)
		const relationFilters = createRuntimeRelationFilterResolver(this)

		try {
			const marker = readNestedWriteRootOperation(operation)
			if (marker === undefined) {
				const scope = { nested: undefined, relationFilters, virtualFields }
				return await runWithRuntimeNestedWriteStageContext(
					undefined,
					async () => {
						await verifyRuntimeLinkTargets(context, operation, (lookup) =>
							this.#executeOperation(lookup, scope),
						)
						return this.#executeOperation(request, scope)
					},
				)
			}

			if (
				(operation.kind !== 'create-one' || marker.command !== 'create') &&
				(operation.kind !== 'update-one' || marker.command !== 'update')
			) {
				throw new TypeError(
					'Runtime nested-write marker does not match its root operation',
				)
			}
			const binding = readRuntimeNestedWrites(this)
			if (binding === undefined) {
				throw new TypeError('Runtime nested writes are not application-bound')
			}
			// The marker check above proves the exact singular root terminal.
			const root = operation as unknown as
				| CreateOneOperationAst<SchemaDefinition>
				| UpdateOneOperationAst<SchemaDefinition>
			const graph = prepareRuntimeNestedWriteGraph(root, marker, binding)
			const rootOperation =
				root.kind === 'create-one'
					? createRuntimeNestedCreateOperation(root, graph.root)
					: createRuntimeNestedUpdateOperation(root, graph.root)
			const execute = async (
				child: DatabaseOperationAst,
				rowFilter?: DatabaseRowFilterNode,
				denied?: true,
				nested?: ActiveNestedWrite,
				relation?: DatabaseRelationScope,
				relationWhere?: false,
			): Promise<unknown> => {
				try {
					return await this.#executeOperation(
						immutableRecord({
							context,
							operation: child,
							...(rowFilter === undefined ? {} : { rowFilter }),
							...(denied === undefined
								? {}
								: { protectedPolicyDeniedAsMissing: denied }),
							...(relation === undefined ? {} : { relation }),
							...(relationWhere === undefined ? {} : { relationWhere }),
						}),
						{ nested, nestedChild: true, relationFilters, virtualFields },
					)
				} catch (error: unknown) {
					if (denied === true && isProtectedPolicyDenied(error)) {
						throw createProtectedObjectNotFoundError()
					}
					throw error
				}
			}
			const coordinator: RuntimeNestedWriteCoordinator =
				new RuntimeNestedWriteCoordinator(
					graph,
					createRuntimeNestedWriteHost(
						binding,
						context,
						graph,
						this.#stages,
						{ execute },
						() => coordinator,
					),
				)

			const result = await runWithRuntimeNestedWriteStageContext(
				createRuntimeNestedWriteStageContext(graph, graph.root, () =>
					coordinator.readRelationChanges(graph.root),
				),
				() =>
					this.#executeOperation(
						immutableRecord({ ...request, operation: rootOperation }),
						{
							nested: immutableRecord({ coordinator, node: graph.root }),
							relationFilters,
							virtualFields,
						},
					),
			)

			return result as unknown as RuntimeOperationResult<TOperation>
		} catch (error: unknown) {
			if (
				request.protectedPolicyDeniedAsMissing !== true ||
				!isProtectedPolicyDenied(error)
			) {
				throw error
			}
			if (operation.kind !== 'find-one' && operation.kind !== 'exists') {
				throw createProtectedObjectNotFoundError()
			}

			const missingResult = operation.kind === 'exists' ? false : null

			return missingResult as RuntimeOperationResult<TOperation>
		}
	}

	/** Executes a structurally trusted request while the public method owns failures. */
	async #executeOperation<const TOperation extends DatabaseOperationAst>(
		request: RuntimePipelineRequest<TOperation>,
		scope: RuntimeOperationScope,
	): Promise<RuntimeOperationResult<TOperation>> {
		const stages = this.#stages
		const { context, relation } = request
		const { nested, relationFilters, virtualFields } = scope
		// A closed command fails before any stage, nested children included.
		assertSchemaCommandOpen(request.operation)
		const privateRowFilter =
			request.rowFilter === undefined
				? undefined
				: normalizeLogicalFilter(request.rowFilter)
		const reservedCreateId = readReservedCreateId(request.operation)
		let operation = await stages.normalization(
			createRuntimeOperationInput(context, request.operation),
		)
		if (reservedCreateId !== undefined) {
			operation = retainReservedCreateId(operation, reservedCreateId)
		}
		operation = await validateRuntimeStructure(this.#stages, context, operation)

		const relationRead =
			relation !== undefined && !isRuntimeMutationOperation(operation)
		if (relationRead && stages.enforcement?.enforceRelationRead !== undefined) {
			await stages.enforcement.enforceRelationRead(
				immutableRecord({ context, operation, relation }),
			)
		}
		const enforced = await enforceRuntimeOperation(
			stages,
			context,
			operation,
			// Nested graph reads already carry their exact private relation scope;
			// unlinking reads omit the declared relation filter.
			relationRead && nested === undefined && request.relationWhere !== false
				? relation
				: undefined,
			privateRowFilter,
			relationFilters,
		)
		operation = enforced.operation

		const virtualProjection = prepareBoundRuntimeVirtualFieldProjection(
			operation,
			virtualFields,
		)
		const inclusions = await this.#inclusionProjector.prepare(
			context,
			operation,
			relationFilters,
		)
		// Nested children answer through the root's inclusions (ADR-0306).
		const readable =
			scope.nestedChild === true
				? {}
				: prepareReadableResultHooks({
						context,
						executor: stages.databaseOperation,
						operation,
						relationFilters,
						stages,
					})
		const cancellation = {
			operationKind: operation.kind,
			phase: 'database-operation',
		}

		throwIfOperationCancelled(context.signal, cancellation)

		const databaseExecution = await executeRuntimeDatabaseOperation(
			stages.databaseOperation,
			context,
			stages.behaviors,
			stages.persistencePlanRewrite,
			immutableRecord({
				operation,
				...(request.protectedPolicyDeniedAsMissing === true
					? { strictTarget: true as const }
					: {}),
				...(inclusions.length === 0
					? {}
					: {
							inclusions: immutableArray(
								inclusions.map(({ database }) => database),
							),
						}),
				...(relation === undefined ? {} : { relation }),
				...(enforced.relationPredicates === undefined
					? {}
					: { relationPredicates: enforced.relationPredicates }),
				...(enforced.rowFilter === undefined
					? {}
					: { rowFilter: enforced.rowFilter }),
				...(virtualProjection === undefined
					? {}
					: { returningSelection: virtualProjection.persistedSelection }),
				...(readable.targets === undefined
					? {}
					: { assertReadableTargets: readable.targets }),
			}),
			stages.finalMutationValidation,
			stages.enforcement,
			enforced.enforcement,
			nested === undefined
				? undefined
				: {
						beforeMutationResolution: (resolvedOperation, target) =>
							nested.coordinator.beforeMutation(
								nested.node,
								resolvedOperation,
								target,
							),
						afterMutationResolution: (resolvedOperation) => {
							nested.coordinator.assertResolvedMutation(
								nested.node,
								resolvedOperation,
							)
						},
						afterMutationOutcome: (outcome) =>
							nested.coordinator.afterMutation(
								nested.node,
								readNestedMutationOutcomeId(outcome, nested.node.command),
							),
					},
		)
		const executedOperation = databaseExecution.operation
		if (executedOperation.kind === 'get' && databaseExecution.result === null) {
			throw createProtectedObjectNotFoundError()
		}
		throwIfOperationCancelled(context.signal, cancellation)

		return finalizeRuntimeOperationResult<TOperation, TOperation>({
			boundaries: this.#resultBoundaries,
			databaseOperation: executedOperation,
			databaseResult: databaseExecution.result,
			enforcement: databaseExecution.enforcement ?? enforced.enforcement,
			hydrate: (databaseResult) =>
				this.#inclusionProjector.hydrate(
					context,
					executedOperation,
					databaseResult,
					databaseExecution.inclusionSource ?? databaseExecution.result,
					inclusions,
					virtualFields,
				),
			outcome: databaseExecution.outcome,
			// Identity follows exact records through result behaviors instead of
			// being reassociated by an unstable final collection index.
			objectIdentities: databaseExecution.objectIdentities,
			stageInput: createRuntimeOperationInput(context, executedOperation),
			stages,
			virtualProjection,
			virtualScheduler: virtualFields,
			...(readable.result === undefined
				? {}
				: { assertReadableResult: readable.result }),
		})
	}
}

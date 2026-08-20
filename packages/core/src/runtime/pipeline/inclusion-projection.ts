import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import {
	createQueryAst,
	type ExecutableOperationAst,
	type FindManyOperationAst,
	type GetOperationAst,
	type QueryMembershipFilterNode,
} from '../../query/index.js'
import { Pointer, Schema, type SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import {
	databaseInclusionCapabilityVersion,
	type DatabaseConstraintNode,
	type DatabaseInclusionPlan,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationOutcome,
	type DatabaseOperationResult,
	type DatabaseRelationPredicateScope,
	type DatabaseRowFilterNode,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/boundaries.js'
import {
	retainRuntimeIncludedPointerValue,
	retainRuntimeSchemaModelMetadata,
	transferRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import {
	readOperationResultInclusion,
	readOperationResultSelection,
} from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'
import {
	createInclusionOperation,
	readInclusions,
	type RuntimeInclusion,
	type RuntimeInclusionTargetOperation,
} from '../relations/inclusion.js'
import type {
	RuntimeOperationResult,
	RuntimePipelineStages,
} from './contracts.js'
import {
	createRuntimeEnforcementInput,
	createRuntimeProjectedDatabaseResultInput,
	createRuntimeOperationInput,
	emptyRuntimeConstraints,
	readRuntimeSchemaModelSelectedFields,
	readRuntimeSelectedFieldsOverride,
	snapshotRuntimeConstraints,
} from './stage-inputs.js'
import type { RuntimePipeline } from './runtime-pipeline.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'

/** Carries one grouped mutation projection without exposing it on RuntimePipeline. */
export interface RuntimeMutationBatchProjectionRequest {
	readonly context: RequestContext
	readonly objectIds: readonly string[]
	readonly operation: FindManyOperationAst<SchemaDefinition>
	readonly results: readonly Readonly<Record<string, unknown>>[]
}

type RuntimeMutationBatchProjector = (
	request: RuntimeMutationBatchProjectionRequest,
) => Promise<readonly Readonly<Record<string, unknown>>[]>

const runtimeMutationBatchProjectors = new WeakMap<
	RuntimePipeline,
	RuntimeMutationBatchProjector
>()

/** Binds the engine-only grouped projection to one immutable pipeline instance. */
export const retainRuntimeMutationBatchProjector = (
	pipeline: RuntimePipeline,
	projector: RuntimeMutationBatchProjector,
): void => {
	runtimeMutationBatchProjectors.set(pipeline, projector)
}

/** Executes one Runtime-owned grouped projection without widening the class API. */
export const projectRuntimeMutationBatch = (
	pipeline: RuntimePipeline,
	request: RuntimeMutationBatchProjectionRequest,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
	const projector = runtimeMutationBatchProjectors.get(pipeline)

	if (projector === undefined) {
		throw new TypeError('Runtime mutation batch projector is unavailable')
	}

	return projector(request)
}

/** Rejects eager loading unless the adapter implements the complete side channel. */
export const assertDatabaseInclusionCapability = (
	executor: DatabaseOperationExecutor,
): void => {
	const capability: unknown = executor.capabilities?.inclusions

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'inclusions' ||
		capability.version !== databaseInclusionCapabilityVersion ||
		typeof executor.readIncludedValue !== 'function'
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement inclusion capability version ${String(databaseInclusionCapabilityVersion)}.`,
			{ publicMessage: 'Relationship inclusion is not available.' },
		)
	}
}

/** Builds one private id read from the exact public mutation projection. */
const createMutationInclusionRead = (
	operation: Extract<
		ExecutableOperationAst,
		{ readonly kind: 'create-one' | 'update-one' }
	>,
	id: string,
): GetOperationAst<SchemaDefinition> => {
	const query =
		operation.kind === 'create-one'
			? createQueryAst(operation.schema.definition)
			: operation.query

	return immutableRecord({
		id,
		kind: 'get' as const,
		query: immutableRecord({
			...query,
			inclusion: readOperationResultInclusion(operation),
			selection: readOperationResultSelection(operation),
			// The persisted identity is authoritative even when an update changes its predicate.
			where: undefined,
		}),
	})
}

/** Reads one persisted identity from private mutation materialization data. */
const readMutationProjectionIdentity = (
	executor: DatabaseOperationExecutor,
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst>,
): string | undefined => {
	const materialization = outcome.materializations[0]

	if (materialization === undefined || !('current' in materialization)) {
		return undefined
	}

	const identity =
		executor.readObjectIdentity?.(materialization.current) ??
		materialization.current.id

	assertNonEmptyString(identity, 'Mutation projection object id')

	return identity
}

/** Loads eager relationship source values without replaying the root pipeline. */
export const loadSingularMutationInclusionSource = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	operation: TOperation,
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst>,
	inclusions: readonly DatabaseInclusionPlan[] | undefined,
): Promise<DatabaseOperationResult<TOperation> | undefined> => {
	if (
		inclusions === undefined ||
		(operation.kind !== 'create-one' && operation.kind !== 'update-one')
	) {
		return undefined
	}

	const identity = readMutationProjectionIdentity(executor, outcome)

	if (identity === undefined) return undefined

	// The terminal discriminant proves the private read shape omitted by the adapter union.
	const executable = operation as unknown as Extract<
		ExecutableOperationAst,
		{ readonly kind: 'create-one' | 'update-one' }
	>
	const projected: unknown = await executor.execute(
		createDatabasePersistenceRequest({
			constraints: emptyRuntimeConstraints,
			inclusions,
			operation: createMutationInclusionRead(executable, identity),
		}),
	)

	if (!isPlainRecord(projected)) {
		throw new TypeError('Mutation inclusion projection must return one record')
	}

	// The private get uses the same schema and projection as the singular mutation.
	return projected as DatabaseOperationResult<TOperation>
}

/** Retains target policy beside one adapter-ready nested read. */
export interface RuntimePreparedInclusion {
	readonly database: DatabaseInclusionPlan
	readonly descriptor: RuntimeInclusion
	readonly enforcement: EnforcementState | undefined
	readonly nested: readonly RuntimePreparedInclusion[]
	readonly operation: RuntimeInclusionTargetOperation
	readonly selectedFieldsOverride: readonly string[] | undefined
	readonly unavailable: boolean
}

/** Restores the operation result after inclusion hydration preserves cardinality. */
const restoreRuntimeInclusionResult = <
	const TOperation extends DatabaseOperationAst,
>(
	result: unknown,
): RuntimeOperationResult<TOperation> =>
	// Every branch below validates the operation-specific null, record, or array
	// shape before replacing only declared relationship field values.
	result as RuntimeOperationResult<TOperation>

/** Owns nested policy projection without replaying root policy or behavior. */
export class RuntimeInclusionProjector {
	readonly #stages: Readonly<RuntimePipelineStages>
	readonly #resultBoundaries: RuntimeBehaviorBoundaries

	constructor(
		stages: Readonly<RuntimePipelineStages>,
		resultBoundaries: RuntimeBehaviorBoundaries,
	) {
		this.#stages = stages
		this.#resultBoundaries = resultBoundaries
	}

	/** Loads all included source values once and restores original batch ordering. */
	async projectMutationBatch(
		request: RuntimeMutationBatchProjectionRequest,
	): Promise<readonly Readonly<Record<string, unknown>>[]> {
		if (request.objectIds.length !== request.results.length) {
			throw new TypeError(
				'Mutation batch projection identities must match result cardinality',
			)
		}

		if (request.objectIds.length === 0) return immutableArray([])

		const expectedIds = new Set<string>()

		for (const id of request.objectIds) {
			assertNonEmptyString(id, 'Mutation batch projection object id')

			if (expectedIds.has(id)) {
				throw new TypeError(
					`Mutation batch contains duplicate object id: ${id}`,
				)
			}

			expectedIds.add(id)
		}

		const expression: QueryMembershipFilterNode<'id', string> = immutableRecord(
			{
				field: 'id',
				kind: 'in',
				values: immutableArray(request.objectIds),
			},
		)
		const operation: FindManyOperationAst<SchemaDefinition> = immutableRecord({
			...request.operation,
			query: immutableRecord({
				...request.operation.query,
				limit: undefined,
				ordering: createQueryAst(request.operation.query.schema.definition)
					.ordering,
				pagination: undefined,
				where: immutableRecord({ expression, kind: 'where' as const }),
			}),
		})
		const inclusions = await this.prepare(request.context, operation)

		if (inclusions.length === 0) return immutableArray(request.results)

		assertDatabaseInclusionCapability(this.#stages.databaseOperation)
		const rawResult: unknown = await this.#stages.databaseOperation.execute(
			createDatabasePersistenceRequest({
				constraints: emptyRuntimeConstraints,
				inclusions: immutableArray(inclusions.map(({ database }) => database)),
				operation,
			}),
		)

		if (!isUnknownArray(rawResult)) {
			throw new TypeError('Mutation batch projection must return an array')
		}

		const sources = new Map<string, Readonly<Record<string, unknown>>>()

		for (const candidate of rawResult) {
			if (!isPlainRecord(candidate)) {
				throw new TypeError('Mutation batch projection must return records')
			}

			const identity =
				this.#stages.databaseOperation.readObjectIdentity?.(candidate) ??
				candidate.id

			assertNonEmptyString(identity, 'Mutation batch projected object id')

			if (!expectedIds.has(identity)) {
				throw new TypeError(
					`Mutation batch projected an unknown object id: ${identity}`,
				)
			}

			if (sources.has(identity)) {
				throw new TypeError(
					`Mutation batch projected duplicate object id: ${identity}`,
				)
			}

			sources.set(identity, candidate)
		}

		if (sources.size !== expectedIds.size) {
			throw new TypeError(
				'Mutation batch projection omitted a persisted object',
			)
		}

		return immutableArray(
			await Promise.all(
				request.results.map((result, index) => {
					const id = request.objectIds[index]
					const source = id === undefined ? undefined : sources.get(id)

					if (source === undefined) {
						throw new TypeError(
							'Mutation batch projection could not restore result order',
						)
					}

					return this.#hydrateRecord(
						request.context,
						result,
						source,
						inclusions,
					)
				}),
			),
		)
	}

	/** Prepares target security without manufacturing target-schema behavior. */
	async prepare(
		context: RequestContext,
		parentOperation: DatabaseOperationAst,
	): Promise<readonly RuntimePreparedInclusion[]> {
		const prepared: RuntimePreparedInclusion[] = []
		const parentSchema = getOperationSchema(parentOperation)

		if (!Schema.is(parentSchema)) {
			throw new TypeError('Runtime inclusion source schema is invalid')
		}

		for (const descriptor of readInclusions(parentOperation)) {
			let operation = createInclusionOperation(descriptor)

			operation = await this.#stages.normalization(
				createRuntimeOperationInput(context, operation),
			)
			operation = await this.#stages.structuralValidation(
				createRuntimeOperationInput(context, operation),
			)

			let enforcement: EnforcementState | undefined
			let constraints: readonly DatabaseConstraintNode[] =
				emptyRuntimeConstraints
			let relationPredicates:
				readonly DatabaseRelationPredicateScope[] | undefined
			let rowFilter: DatabaseRowFilterNode | undefined

			if (
				descriptor.kind === 'relation' &&
				this.#stages.enforcement?.enforceRelationRead !== undefined
			) {
				await this.#stages.enforcement.enforceRelationRead(
					immutableRecord({
						context,
						operation,
						relation: immutableRecord({
							fieldPath: immutableArray([descriptor.field]),
							source: parentSchema,
							target: descriptor.query.schema.definition,
						}),
					}),
				)
			}

			try {
				if (this.#stages.enforcement !== undefined) {
					enforcement = await this.#stages.enforcement.evaluate(
						createRuntimeOperationInput(context, operation),
					)
					const enforced = await this.#stages.enforcement.enforceOperation(
						createRuntimeEnforcementInput(context, operation, enforcement),
					)

					operation = enforced.operation
					constraints = snapshotRuntimeConstraints(enforced.constraints)
					relationPredicates = enforced.relationPredicates
					rowFilter = enforced.rowFilter
				}
			} catch (error: unknown) {
				if (!isProtectedPolicyDenied(error)) throw error

				const request = createDatabasePersistenceRequest({
					constraints: emptyRuntimeConstraints,
					operation,
				})
				const database = immutableRecord({
					fieldPath: immutableArray([descriptor.field]),
					kind: descriptor.kind,
					request,
					unavailable: true as const,
				})

				prepared.push(
					immutableRecord({
						database,
						descriptor,
						enforcement: undefined,
						nested: immutableArray([]),
						operation,
						selectedFieldsOverride: undefined,
						unavailable: true,
					}),
				)
				continue
			}

			const nested = await this.prepare(context, operation)
			const request = createDatabasePersistenceRequest({
				constraints,
				operation,
				...(nested.length === 0
					? {}
					: {
							inclusions: immutableArray(
								nested.map(({ database }) => database),
							),
						}),
				...(relationPredicates === undefined ? {} : { relationPredicates }),
				...(rowFilter === undefined ? {} : { rowFilter }),
			})
			const database = immutableRecord({
				fieldPath: immutableArray([descriptor.field]),
				kind: descriptor.kind,
				request,
			})

			prepared.push(
				immutableRecord({
					database,
					descriptor,
					enforcement,
					nested,
					operation,
					selectedFieldsOverride: readRuntimeSelectedFieldsOverride(
						operation,
						enforcement,
					),
					unavailable: false,
				}),
			)
		}

		return immutableArray(prepared)
	}

	/** Completes policy and scalar output resolution for one eager target branch. */
	async #finalizeValue(
		context: RequestContext,
		prepared: RuntimePreparedInclusion,
		rawTarget:
			| Readonly<Record<string, unknown>>
			| readonly Readonly<Record<string, unknown>>[],
	): Promise<unknown> {
		// Inclusion descriptors fix this raw target's operation-specific cardinality.
		let result =
			rawTarget as DatabaseOperationResult<RuntimeInclusionTargetOperation>

		if (
			this.#stages.enforcement !== undefined &&
			prepared.enforcement !== undefined
		) {
			result = await this.#stages.enforcement.enforceSelectionResult(
				immutableRecord({
					context,
					enforcement: prepared.enforcement,
					operation: prepared.operation,
					result,
				}),
			)
		}

		result = this.#resultBoundaries.snapshotDatabaseResultReplacement(
			prepared.operation,
			result,
			prepared.selectedFieldsOverride,
		)

		if (this.#stages.behaviors?.transformDatabaseResult !== undefined) {
			result = await this.#stages.behaviors.transformDatabaseResult(
				createRuntimeProjectedDatabaseResultInput(
					context,
					prepared.operation,
					result,
					prepared.selectedFieldsOverride,
				),
			)
		}

		const hydrated = await this.hydrate(
			context,
			prepared.operation,
			result,
			rawTarget,
			prepared.nested,
		)
		const rawRecords = isUnknownArray(rawTarget) ? rawTarget : [rawTarget]
		const identities = immutableArray(
			rawRecords.map((record) =>
				isPlainRecord(record)
					? this.#stages.databaseOperation.readObjectIdentity?.(record)
					: undefined,
			),
		)

		retainRuntimeSchemaModelMetadata(
			prepared.operation,
			identities,
			hydrated,
			readRuntimeSchemaModelSelectedFields(
				prepared.operation,
				prepared.selectedFieldsOverride,
			),
		)
		let finalized = hydrated

		if (
			this.#stages.enforcement !== undefined &&
			prepared.enforcement !== undefined
		) {
			finalized = await this.#stages.enforcement.enforceResult(
				immutableRecord({
					context,
					enforcement: prepared.enforcement,
					operation: prepared.operation,
					result: finalized,
				}),
			)
		}

		if (prepared.descriptor.kind === 'pointer' && !isPlainRecord(finalized)) {
			throw new TypeError('Runtime included pointer target must be a record')
		}
		if (prepared.descriptor.kind === 'relation' && !isUnknownArray(finalized)) {
			throw new TypeError('Runtime included relation target must be an array')
		}

		return finalized
	}

	/** Replaces relationship fields with their adapter-retained target values. */
	async #hydrateRecord(
		context: RequestContext,
		record: Readonly<Record<string, unknown>>,
		rawRecord: Readonly<Record<string, unknown>>,
		inclusions: readonly RuntimePreparedInclusion[],
	): Promise<Readonly<Record<string, unknown>>> {
		let hydrated = record

		for (const inclusion of inclusions) {
			const field = inclusion.descriptor.field
			const pointer: unknown = hydrated[field]

			if (inclusion.descriptor.kind === 'pointer') {
				if (!Object.hasOwn(hydrated, field) || pointer === null) continue
				if (!Pointer.is(pointer)) {
					throw new TypeError(
						`Runtime pointer inclusion ${field} must receive a Pointer`,
					)
				}
			}

			let target: unknown =
				inclusion.descriptor.kind === 'pointer' ? null : immutableArray([])

			if (!inclusion.unavailable) {
				const retained = this.#stages.databaseOperation.readIncludedValue?.(
					rawRecord,
					inclusion.database.fieldPath,
				)

				if (retained === undefined) {
					throw new TypeError(
						`Database adapter did not retain relationship inclusion ${field}`,
					)
				}
				target = retained
			}

			if (
				inclusion.descriptor.kind === 'pointer' &&
				target !== null &&
				!isPlainRecord(target)
			) {
				throw new TypeError(
					`Runtime included pointer ${field} must be a record`,
				)
			}
			if (inclusion.descriptor.kind === 'relation' && !isUnknownArray(target)) {
				throw new TypeError(
					`Runtime included relation ${field} must be an array`,
				)
			}

			const replacement =
				target === null
					? null
					: await this.#finalizeValue(
							context,
							inclusion,
							target as
								| Readonly<Record<string, unknown>>
								| readonly Readonly<Record<string, unknown>>[],
						)
			const next = immutableRecord({ ...hydrated, [field]: replacement })

			transferRuntimeSchemaModelMetadata(hydrated, next)
			if (inclusion.descriptor.kind === 'pointer') {
				retainRuntimeIncludedPointerValue(next, [field], pointer)
			}
			hydrated = next
		}

		return hydrated
	}

	/** Preserves root cardinality while hydrating exact adapter records by index. */
	async hydrate<const TOperation extends DatabaseOperationAst>(
		context: RequestContext,
		operation: TOperation,
		result: DatabaseOperationResult<TOperation>,
		rawResult: DatabaseOperationResult<TOperation>,
		inclusions: readonly RuntimePreparedInclusion[],
	): Promise<RuntimeOperationResult<TOperation>> {
		if (inclusions.length === 0 || result === null) {
			return restoreRuntimeInclusionResult<TOperation>(result)
		}

		if (operation.kind === 'find-many') {
			if (!isUnknownArray(result) || !isUnknownArray(rawResult)) {
				throw new TypeError('Runtime included collection must be an array')
			}
			if (result.length !== rawResult.length) {
				throw new TypeError(
					'Runtime included cardinality changed before hydration',
				)
			}

			return restoreRuntimeInclusionResult<TOperation>(
				immutableArray(
					await Promise.all(
						result.map((record, index) => {
							const rawRecord: unknown = rawResult[index]

							if (!isPlainRecord(record) || !isPlainRecord(rawRecord)) {
								throw new TypeError('Runtime included source must be a record')
							}

							return this.#hydrateRecord(context, record, rawRecord, inclusions)
						}),
					),
				),
			)
		}

		if (!isPlainRecord(result) || !isPlainRecord(rawResult)) {
			throw new TypeError('Runtime included source must be a record')
		}

		return restoreRuntimeInclusionResult<TOperation>(
			await this.#hydrateRecord(context, result, rawResult, inclusions),
		)
	}
}

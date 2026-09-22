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
	type FindManyOperationAst,
	type QueryMembershipFilterNode,
} from '../../query/index.js'
import { Pointer, Schema, type SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import {
	databaseInclusionCapabilityVersion,
	type DatabaseInclusionPlan,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationResult,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/boundaries.js'
import {
	retainRuntimeIncludedPointerValue,
	transferRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
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
	createRuntimeOperationInput,
	emptyRuntimeConstraints,
	readRuntimeSelectedFieldsOverride,
} from './stage-inputs.js'
import type { RuntimePipeline } from './runtime-pipeline.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import {
	prepareRuntimeVirtualFieldProjection,
	type RuntimeVirtualFieldProjection,
} from '../virtual-fields/projection.js'
import {
	finalizeRuntimeInclusionValue,
	restoreRuntimeInclusionResult,
} from './inclusion-finalization.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import {
	prepareRuntimeInclusionEnforcement,
	type RuntimeInclusionEnforcementResult,
} from './inclusion-enforcement.js'

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

export { loadSingularMutationInclusionSource } from './mutation-inclusion-source.js'

/** Retains target policy beside one adapter-ready nested read. */
export interface RuntimePreparedInclusion {
	readonly database: DatabaseInclusionPlan
	readonly descriptor: RuntimeInclusion
	readonly enforcement: EnforcementState | undefined
	readonly nested: readonly RuntimePreparedInclusion[]
	readonly operation: RuntimeInclusionTargetOperation
	readonly selectedFieldsOverride: readonly string[] | undefined
	readonly unavailable: boolean
	readonly virtualProjection: RuntimeVirtualFieldProjection | undefined
}

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
		virtualScheduler?: RuntimeVirtualFieldScheduler,
		relationFilterResolver?: RuntimeRelationFilterResolver,
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
		const inclusions = await this.prepare(
			request.context,
			operation,
			relationFilterResolver,
		)

		if (inclusions.length === 0) return immutableArray(request.results)

		assertDatabaseInclusionCapability(this.#stages.databaseOperation)
		const rootVirtualProjection =
			prepareRuntimeVirtualFieldProjection(operation)
		const rawResult: unknown = await this.#stages.databaseOperation.execute(
			createDatabasePersistenceRequest(
				{
					constraints: emptyRuntimeConstraints,
					inclusions: immutableArray(
						inclusions.map(({ database }) => database),
					),
					operation,
				},
				rootVirtualProjection?.persistedSelection,
			),
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

		const projected: Readonly<Record<string, unknown>>[] = []
		for (const [index, result] of request.results.entries()) {
			const id = request.objectIds[index]
			const source = id === undefined ? undefined : sources.get(id)

			if (source === undefined) {
				throw new TypeError(
					'Mutation batch projection could not restore result order',
				)
			}
			projected.push(
				await this.#hydrateRecord(
					request.context,
					result,
					source,
					inclusions,
					virtualScheduler,
				),
			)
		}

		return immutableArray(projected)
	}

	/** Prepares target security without manufacturing target-schema behavior. */
	async prepare(
		context: RequestContext,
		parentOperation: DatabaseOperationAst,
		relationFilterResolver?: RuntimeRelationFilterResolver,
	): Promise<readonly RuntimePreparedInclusion[]> {
		const prepared: RuntimePreparedInclusion[] = []
		const parentSchema = getOperationSchema(parentOperation)

		if (!Schema.is(parentSchema)) {
			throw new TypeError('Runtime inclusion source schema is invalid')
		}

		for (const descriptor of readInclusions(parentOperation)) {
			let operation = createInclusionOperation(descriptor)
			const relation =
				descriptor.kind === 'relation'
					? immutableRecord({
							fieldPath: immutableArray([descriptor.field]),
							source: parentSchema,
							target: descriptor.query.schema.definition,
						})
					: undefined

			operation = await this.#stages.normalization(
				createRuntimeOperationInput(context, operation),
			)
			operation = await this.#stages.structuralValidation(
				createRuntimeOperationInput(context, operation),
			)

			let preparedEnforcement: RuntimeInclusionEnforcementResult

			if (
				relation !== undefined &&
				this.#stages.enforcement?.enforceRelationRead !== undefined
			) {
				await this.#stages.enforcement.enforceRelationRead(
					immutableRecord({
						context,
						operation,
						relation,
					}),
				)
			}

			try {
				preparedEnforcement = await prepareRuntimeInclusionEnforcement(
					this.#stages,
					context,
					operation,
					relation,
					relationFilterResolver,
				)
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
						virtualProjection: undefined,
					}),
				)
				continue
			}

			const { constraints, enforcement, relationPredicates, rowFilter } =
				preparedEnforcement
			operation = preparedEnforcement.operation
			const virtualProjection = prepareRuntimeVirtualFieldProjection(operation)
			const nested = await this.prepare(
				context,
				operation,
				relationFilterResolver,
			)
			const request = createDatabasePersistenceRequest(
				{
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
				},
				virtualProjection?.persistedSelection,
			)
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
					virtualProjection,
				}),
			)
		}

		return immutableArray(prepared)
	}

	/** Replaces relationship fields with their adapter-retained target values. */
	async #hydrateRecord(
		context: RequestContext,
		record: Readonly<Record<string, unknown>>,
		rawRecord: Readonly<Record<string, unknown>>,
		inclusions: readonly RuntimePreparedInclusion[],
		virtualScheduler?: RuntimeVirtualFieldScheduler,
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
					: await finalizeRuntimeInclusionValue(
							context,
							inclusion,
							target as
								| Readonly<Record<string, unknown>>
								| readonly Readonly<Record<string, unknown>>[],
							this.#stages,
							this.#resultBoundaries,
							(result, rawResult, nested, scheduler) =>
								this.hydrate(
									context,
									inclusion.operation,
									result,
									rawResult,
									nested,
									scheduler,
								),
							virtualScheduler,
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
		virtualScheduler?: RuntimeVirtualFieldScheduler,
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

			const hydrated: Readonly<Record<string, unknown>>[] = []
			for (const [index, record] of result.entries()) {
				const rawRecord: unknown = rawResult[index]
				if (!isPlainRecord(record) || !isPlainRecord(rawRecord)) {
					throw new TypeError('Runtime included source must be a record')
				}
				hydrated.push(
					await this.#hydrateRecord(
						context,
						record,
						rawRecord,
						inclusions,
						virtualScheduler,
					),
				)
			}
			return restoreRuntimeInclusionResult<TOperation>(immutableArray(hydrated))
		}

		if (!isPlainRecord(result) || !isPlainRecord(rawResult)) {
			throw new TypeError('Runtime included source must be a record')
		}

		return restoreRuntimeInclusionResult<TOperation>(
			await this.#hydrateRecord(
				context,
				result,
				rawResult,
				inclusions,
				virtualScheduler,
			),
		)
	}
}

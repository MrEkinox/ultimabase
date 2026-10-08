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
import type {
	DatabaseInclusionPlan,
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/validation-boundaries.js'
import {
	retainRuntimeIncludedPointerValue,
	retainRuntimeSchemaModelMetadata,
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
	createRuntimeStageInput,
	emptyRuntimeConstraints,
	enforceRuntimeOperation,
	readRuntimeSchemaModelSelectedFields,
	readRuntimeSelectedFieldsOverride,
	type RuntimeOperationEnforcement,
} from './stage-inputs.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import type { RuntimeVirtualFieldScheduler } from '../virtual-fields/execution.js'
import { prepareRuntimeVirtualDatabaseResult } from '../virtual-fields/pipeline.js'
import {
	prepareRuntimeVirtualFieldProjection,
	type RuntimeVirtualFieldProjection,
} from '../virtual-fields/projection.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import { assertDatabaseInclusionCapability } from './mutation-inclusion-source.js'
import { assertPlainObject } from '../../exact-object-validation.js'

type LogicalRecord = Readonly<Record<string, unknown>>

/** Carries one grouped mutation projection without exposing it on RuntimePipeline. */
export interface RuntimeMutationBatchProjectionRequest {
	readonly context: RequestContext
	readonly objectIds: readonly string[]
	readonly operation: FindManyOperationAst<SchemaDefinition>
	readonly results: readonly LogicalRecord[]
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
	readonly virtualProjection: RuntimeVirtualFieldProjection | undefined
}

/** Restores the terminal-specific result after hydration preserved its cardinality. */
const restoreResult = <const TOperation extends DatabaseOperationAst>(
	result: unknown,
): RuntimeOperationResult<TOperation> =>
	// Callers validate the exact null, record, or array shape before replacing fields.
	result as RuntimeOperationResult<TOperation>

/** Owns nested policy projection without replaying root policy or behavior. */
export class RuntimeInclusionProjector {
	readonly #stages: Readonly<RuntimePipelineStages>
	readonly #boundaries: RuntimeBehaviorBoundaries

	constructor(
		stages: Readonly<RuntimePipelineStages>,
		resultBoundaries: RuntimeBehaviorBoundaries,
	) {
		this.#stages = stages
		this.#boundaries = resultBoundaries
	}

	/** Loads all included source values once and restores original batch ordering. */
	async projectMutationBatch(
		request: RuntimeMutationBatchProjectionRequest,
		virtualScheduler?: RuntimeVirtualFieldScheduler,
		relationFilterResolver?: RuntimeRelationFilterResolver,
	): Promise<readonly LogicalRecord[]> {
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
			{ field: 'id', kind: 'in', values: immutableArray(request.objectIds) },
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

		const executor = this.#stages.databaseOperation
		assertDatabaseInclusionCapability(executor)
		const rawResult: unknown = await executor.execute(
			createDatabasePersistenceRequest(
				{
					constraints: emptyRuntimeConstraints,
					inclusions: immutableArray(
						inclusions.map(({ database }) => database),
					),
					operation,
				},
				prepareRuntimeVirtualFieldProjection(operation)?.persistedSelection,
			),
		)

		if (!isUnknownArray(rawResult)) {
			throw new TypeError('Mutation batch projection must return an array')
		}

		const sources = new Map<string, LogicalRecord>()

		for (const candidate of rawResult) {
			assertPlainObject(
				candidate,
				'Mutation batch projection must return records',
			)

			const identity = executor.readObjectIdentity?.(candidate) ?? candidate.id
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

		const projected: LogicalRecord[] = []
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
			const fieldPath = immutableArray([descriptor.field])
			const relation =
				descriptor.kind === 'relation'
					? immutableRecord({
							fieldPath,
							source: parentSchema,
							target: descriptor.query.schema.definition,
						})
					: undefined
			let operation = await this.#stages.normalization(
				createRuntimeOperationInput(
					context,
					createInclusionOperation(descriptor),
				),
			)
			operation = await this.#stages.structuralValidation(
				createRuntimeOperationInput(context, operation),
			)

			if (
				relation !== undefined &&
				this.#stages.enforcement?.enforceRelationRead !== undefined
			) {
				await this.#stages.enforcement.enforceRelationRead(
					immutableRecord({ context, operation, relation }),
				)
			}

			let enforced: RuntimeOperationEnforcement<RuntimeInclusionTargetOperation>
			try {
				enforced = await enforceRuntimeOperation(
					this.#stages,
					context,
					operation,
					relation,
					undefined,
					relationFilterResolver,
				)
			} catch (error: unknown) {
				if (!isProtectedPolicyDenied(error)) throw error

				// A denied target hides its relationship value instead of failing the parent.
				prepared.push(
					immutableRecord({
						database: immutableRecord({
							fieldPath,
							kind: descriptor.kind,
							request: createDatabasePersistenceRequest({
								constraints: emptyRuntimeConstraints,
								operation,
							}),
							unavailable: true as const,
						}),
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
				enforced
			operation = enforced.operation
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

			prepared.push(
				immutableRecord({
					database: immutableRecord({
						fieldPath,
						kind: descriptor.kind,
						request,
					}),
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

	/** Completes one eager target through the same private virtual projection boundary. */
	async #finalizeTarget(
		context: RequestContext,
		prepared: RuntimePreparedInclusion,
		rawTarget: LogicalRecord | readonly LogicalRecord[],
		scheduler: RuntimeVirtualFieldScheduler | undefined,
	): Promise<unknown> {
		const stages = this.#stages
		const { enforcement, operation, selectedFieldsOverride } = prepared
		const source = rawTarget as DatabaseOperationResult<typeof operation>
		const virtualResults = prepareRuntimeVirtualDatabaseResult(
			this.#boundaries,
			operation,
			prepared.virtualProjection,
			source,
		)
		let result = virtualResults.publicResult

		if (stages.enforcement !== undefined && enforcement !== undefined) {
			result = await stages.enforcement.enforceSelectionResult(
				immutableRecord({ context, enforcement, operation, result }),
			)
		}
		result = this.#boundaries.snapshotDatabaseResultReplacement(
			operation,
			result,
			selectedFieldsOverride,
		)
		if (stages.behaviors?.transformDatabaseResult !== undefined) {
			result = await stages.behaviors.transformDatabaseResult(
				createRuntimeStageInput({
					context,
					operation,
					result,
					...(selectedFieldsOverride === undefined
						? {}
						: { selectedFieldsOverride }),
				}),
			)
		}

		let finalized = await this.hydrate(
			context,
			operation,
			result,
			source,
			prepared.nested,
			scheduler,
		)
		const rawRecords = isUnknownArray(rawTarget) ? rawTarget : [rawTarget]
		retainRuntimeSchemaModelMetadata(
			operation,
			immutableArray(
				rawRecords.map((record) =>
					isPlainRecord(record)
						? stages.databaseOperation.readObjectIdentity?.(record)
						: undefined,
				),
			),
			finalized,
			readRuntimeSchemaModelSelectedFields(operation, selectedFieldsOverride),
		)

		if (prepared.virtualProjection !== undefined) {
			if (scheduler === undefined) {
				throw new FrameworkError(
					'INTERNAL_ERROR',
					'Runtime included virtual fields are not application-bound.',
					{ publicMessage: 'The operation could not be completed.' },
				)
			}
			finalized = await scheduler.resolve(
				context,
				operation,
				prepared.virtualProjection,
				finalized,
				virtualResults.privateResult,
			)
		}

		if (stages.enforcement !== undefined && enforcement !== undefined) {
			finalized = await stages.enforcement.enforceResult(
				immutableRecord({ context, enforcement, operation, result: finalized }),
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
		record: LogicalRecord,
		rawRecord: LogicalRecord,
		inclusions: readonly RuntimePreparedInclusion[],
		virtualScheduler?: RuntimeVirtualFieldScheduler,
	): Promise<LogicalRecord> {
		let hydrated = record

		for (const inclusion of inclusions) {
			const { field, kind } = inclusion.descriptor
			const pointer: unknown = hydrated[field]

			if (kind === 'pointer') {
				if (!Object.hasOwn(hydrated, field) || pointer === null) continue
				if (!Pointer.is(pointer)) {
					throw new TypeError(
						`Runtime pointer inclusion ${field} must receive a Pointer`,
					)
				}
			}

			let target: unknown = kind === 'pointer' ? null : immutableArray([])

			if (!inclusion.unavailable) {
				target = this.#stages.databaseOperation.readIncludedValue?.(
					rawRecord,
					inclusion.database.fieldPath,
				)
				if (target === undefined) {
					throw new TypeError(
						`Database adapter did not retain relationship inclusion ${field}`,
					)
				}
			}

			if (kind === 'pointer' && target !== null && !isPlainRecord(target)) {
				throw new TypeError(
					`Runtime included pointer ${field} must be a record`,
				)
			}
			if (kind === 'relation' && !isUnknownArray(target)) {
				throw new TypeError(
					`Runtime included relation ${field} must be an array`,
				)
			}

			const replacement =
				target === null
					? null
					: await this.#finalizeTarget(
							context,
							inclusion,
							target as LogicalRecord | readonly LogicalRecord[],
							virtualScheduler,
						)
			const next = immutableRecord({ ...hydrated, [field]: replacement })

			transferRuntimeSchemaModelMetadata(hydrated, next)
			if (kind === 'pointer') {
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
			return restoreResult<TOperation>(result)
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

			const hydrated: LogicalRecord[] = []
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
			return restoreResult<TOperation>(immutableArray(hydrated))
		}

		if (!isPlainRecord(result) || !isPlainRecord(rawResult)) {
			throw new TypeError('Runtime included source must be a record')
		}

		return restoreResult<TOperation>(
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

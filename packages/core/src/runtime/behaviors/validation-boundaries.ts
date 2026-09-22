import { isDeepStrictEqual } from 'node:util'
import {
	compileValidationPlans,
	Pointer,
	type SchemaDefinition,
	type SchemaValidationPlans,
	type ValidationIssuePath,
} from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import * as modelMetadata from '../operations/model-metadata.js'
import { snapshotRuntimeMutationOperation } from '../validation/runtime-validation.js'
import {
	createInclusionOperation,
	readInclusions,
} from '../relations/inclusion.js'
import {
	snapshotRuntimeBoundaryRecord,
	snapshotRuntimeBoundaryResult,
} from './result-snapshot.js'

import {
	adapterBoundaryErrorDescription,
	assertExactKeys,
	assertSameQueryResultShape,
	behaviorBoundaryErrorDescription,
	isMutationOperation,
	isNullableResultKind,
	readOperationKeys,
	readOperationSchema,
	readOptionalOperationKeys,
	readSelectedFields,
	snapshotBoundaryValue,
	throwBoundaryIssue,
} from './validation-boundary-helpers.js'
import {
	assertOutcomeCardinality,
	snapshotMaterialization,
} from './validation-boundary-materialization.js'

/** Owns immutable validation boundaries shared by every Runtime behavior. */
export interface RuntimeBehaviorBoundaries {
	/** Deeply snapshots trusted Runtime data without applying operation semantics. */
	snapshotValue<const TValue>(value: TValue): TValue

	/** Snapshots a replacement while preserving its exact terminal and schema identity. */
	snapshotOperationReplacement<const TOperation extends DatabaseOperationAst>(
		operation: TOperation,
		replacement: unknown,
	): TOperation

	/** Retains a prepared target by allowing only mutation-value replacement. */
	snapshotPreparedOperationReplacement<
		const TOperation extends DatabaseMutationOperationAst,
	>(
		operation: TOperation,
		replacement: unknown,
	): TOperation

	/** Validates one behavior-transformed result against its terminal and selection. */
	snapshotResultReplacement<const TOperation extends DatabaseOperationAst>(
		operation: TOperation,
		replacement: unknown,
		selectedFieldsOverride?: readonly string[],
	): RuntimeOperationResult<TOperation>

	/** Validates one pre-hydration adapter result before scalar output resolution. */
	snapshotDatabaseResultReplacement<
		const TOperation extends DatabaseOperationAst,
	>(
		operation: TOperation,
		replacement: unknown,
		selectedFieldsOverride?: readonly string[],
	): DatabaseOperationResult<TOperation>

	/** Validates the selected result and complete materializations returned by an adapter. */
	snapshotMutationOutcome<
		const TOperation extends DatabaseMutationOperationAst,
	>(
		operation: TOperation,
		outcome: unknown,
		selectedFieldsOverride?: readonly string[],
	): DatabaseOperationOutcome<TOperation>
}

export const createRuntimeBehaviorBoundaries =
	(): RuntimeBehaviorBoundaries => {
		const plansBySchema = new WeakMap<object, SchemaValidationPlans>()
		const readPlans = (schema: SchemaDefinition): SchemaValidationPlans => {
			let plans = plansBySchema.get(schema)

			if (plans === undefined) {
				plans = compileValidationPlans(schema)
				plansBySchema.set(schema, plans)
			}

			return plans
		}

		const readBoundaryContext = (
			operation: DatabaseOperationAst,
			selectedFieldsOverride?: readonly string[],
		): Readonly<{
			readonly plans: SchemaValidationPlans
			readonly schema: SchemaDefinition
			readonly selectedFields: readonly string[] | undefined
		}> => {
			const schema = readOperationSchema(operation, ['operation', 'schema'])
			const plans = readPlans(schema)

			return immutableRecord({
				plans,
				schema,
				selectedFields:
					selectedFieldsOverride ?? readSelectedFields(operation, schema),
			})
		}

		const snapshotOperationShape = <
			const TOperation extends DatabaseOperationAst,
		>(
			operation: TOperation,
			replacement: unknown,
		): TOperation => {
			if (!isPlainRecord(replacement)) {
				return throwBoundaryIssue(
					['operation'],
					'Runtime behavior operation replacement must be a plain object',
				)
			}

			if (replacement.kind !== operation.kind) {
				return throwBoundaryIssue(
					['operation', 'kind'],
					`Runtime behavior must retain terminal ${operation.kind}`,
				)
			}

			assertExactKeys(
				replacement,
				readOperationKeys(operation.kind),
				['operation'],
				behaviorBoundaryErrorDescription,
				readOptionalOperationKeys(operation.kind),
			)

			const originalSchema = readOperationSchema(operation, [
				'operation',
				'schema',
			])
			const replacementSchema = readOperationSchema(replacement, [
				'operation',
				'schema',
			])

			if (replacementSchema !== originalSchema) {
				return throwBoundaryIssue(
					['operation', 'schema'],
					'Runtime behavior must retain the exact schema identity',
				)
			}

			assertSameQueryResultShape(operation, replacement)

			return snapshotBoundaryValue(
				replacement,
				['operation'],
				new WeakSet<object>(),
			) as TOperation
		}

		/** Validates hydrated targets while preserving the pointer field's declared scalar contract. */
		const snapshotIncludedRecord = (
			operation: DatabaseOperationAst,
			value: unknown,
			path: ValidationIssuePath,
			selectedFields: readonly string[] | undefined,
			includeVirtuals: boolean,
		): Readonly<Record<string, unknown>> => {
			const schema = readOperationSchema(operation, ['operation', 'schema'])
			const inclusions = readInclusions(operation)
			const effectiveSelectedFields = modelMetadata.resolveSelectedFields(
				value,
				selectedFields,
			)
			if (inclusions.length === 0 || !isPlainRecord(value)) {
				return snapshotRuntimeBoundaryRecord(
					schema,
					readPlans(schema),
					value,
					path,
					effectiveSelectedFields,
					behaviorBoundaryErrorDescription,
					includeVirtuals,
				)
			}

			const parentCandidate: Record<string, unknown> = { ...value }
			const hydratedTargets = new Map<string, unknown>()

			for (const inclusion of inclusions) {
				const targetValue: unknown = value[inclusion.field]

				const targetOperation = createInclusionOperation(inclusion)
				const targetSchema = readOperationSchema(targetOperation, [
					...path,
					inclusion.field,
				])

				let targetSnapshot: unknown

				if (inclusion.kind === 'pointer') {
					if (targetValue !== null && !isPlainRecord(targetValue)) continue

					targetSnapshot =
						targetValue === null
							? null
							: snapshotIncludedRecord(
									targetOperation,
									targetValue,
									[...path, inclusion.field],
									readSelectedFields(targetOperation, targetSchema),
									includeVirtuals,
								)
					// Parent validation still proves that the declared field itself is a pointer.
					parentCandidate[inclusion.field] = new Pointer(
						targetSchema,
						'__ultimabase_hook_boundary__',
					)
				} else {
					if (!isUnknownArray(targetValue)) continue

					targetSnapshot = immutableArray(
						targetValue.map((targetRecord, index) =>
							snapshotIncludedRecord(
								targetOperation,
								targetRecord,
								[...path, inclusion.field, index],
								readSelectedFields(targetOperation, targetSchema),
								includeVirtuals,
							),
						),
					)
					// Relation fields are handle-only unless this exact result included them.
					Reflect.deleteProperty(parentCandidate, inclusion.field)
				}

				hydratedTargets.set(inclusion.field, targetSnapshot)
			}

			const parent = snapshotRuntimeBoundaryRecord(
				schema,
				readPlans(schema),
				parentCandidate,
				path,
				effectiveSelectedFields,
				behaviorBoundaryErrorDescription,
				includeVirtuals,
			)

			// The placeholder pointer exists only for structural validation. Restore the
			// source record's private identity and declared pointer values on its snapshot.
			modelMetadata.transferRuntimeSchemaModelMetadata(value, parent)

			if (hydratedTargets.size === 0) return parent

			const snapshot = immutableRecord({
				...parent,
				...Object.fromEntries(hydratedTargets),
			})

			modelMetadata.transferRuntimeSchemaModelMetadata(parent, snapshot)

			return snapshot
		}

		const snapshotIncludedResult = <
			const TOperation extends DatabaseOperationAst,
		>(
			operation: TOperation,
			replacement: unknown,
			selectedFields: readonly string[] | undefined,
			includeVirtuals: boolean,
		): DatabaseOperationResult<TOperation> => {
			if (readInclusions(operation).length === 0) {
				const schema = readOperationSchema(operation, ['operation', 'schema'])
				return snapshotRuntimeBoundaryResult(
					operation,
					schema,
					replacement,
					readPlans(schema),
					selectedFields,
					['result'],
					behaviorBoundaryErrorDescription,
					includeVirtuals,
					throwBoundaryIssue,
				)
			}

			if (replacement === null) {
				if (!isNullableResultKind(operation.kind)) {
					return throwBoundaryIssue(
						['result'],
						'This terminal cannot return null',
					)
				}

				return null as DatabaseOperationResult<TOperation>
			}

			if (operation.kind === 'find-many') {
				if (!isUnknownArray(replacement)) {
					return throwBoundaryIssue(
						['result'],
						'This terminal must return an array',
					)
				}

				return immutableArray(
					replacement.map((record, index) =>
						snapshotIncludedRecord(
							operation,
							record,
							['result', index],
							selectedFields,
							includeVirtuals,
						),
					),
				) as DatabaseOperationResult<TOperation>
			}

			return snapshotIncludedRecord(
				operation,
				replacement,
				['result'],
				selectedFields,
				includeVirtuals,
			) as DatabaseOperationResult<TOperation>
		}

		return immutableRecord({
			snapshotValue: <const TValue>(value: TValue): TValue =>
				snapshotBoundaryValue(value, [], new WeakSet<object>()) as TValue,
			snapshotMutationOutcome: <
				const TOperation extends DatabaseMutationOperationAst,
			>(
				operation: TOperation,
				outcome: unknown,
				selectedFieldsOverride?: readonly string[],
			): DatabaseOperationOutcome<TOperation> => {
				if (!isPlainRecord(outcome)) {
					return throwBoundaryIssue(
						['outcome'],
						'Database outcome must be a plain object',
						adapterBoundaryErrorDescription,
					)
				}

				assertExactKeys(
					outcome,
					['result', 'materializations'],
					['outcome'],
					adapterBoundaryErrorDescription,
				)
				if (!isUnknownArray(outcome.materializations)) {
					return throwBoundaryIssue(
						['outcome', 'materializations'],
						'Outcome materializations must be an array',
						adapterBoundaryErrorDescription,
					)
				}

				const boundary = readBoundaryContext(operation, selectedFieldsOverride)
				const result = snapshotRuntimeBoundaryResult(
					operation,
					readOperationSchema(operation, ['operation', 'schema']),
					outcome.result,
					boundary.plans,
					boundary.selectedFields,
					['outcome', 'result'],
					adapterBoundaryErrorDescription,
					false,
					throwBoundaryIssue,
				)
				assertOutcomeCardinality(operation, result, outcome.materializations)
				const materializations = immutableArray(
					outcome.materializations.map((materialization, index) =>
						snapshotMaterialization(
							operation,
							materialization,
							boundary.plans,
							['outcome', 'materializations', index],
						),
					),
				)

				return immutableRecord({
					materializations,
					result,
				}) as DatabaseOperationOutcome<TOperation>
			},
			snapshotOperationReplacement: <
				const TOperation extends DatabaseOperationAst,
			>(
				operation: TOperation,
				replacement: unknown,
			): TOperation => {
				const snapshot = snapshotOperationShape(operation, replacement)

				if (!isMutationOperation(operation) || !isMutationOperation(snapshot)) {
					return snapshot
				}

				const { plans } = readBoundaryContext(snapshot)

				return snapshotRuntimeMutationOperation(operation, snapshot, plans)
			},
			snapshotPreparedOperationReplacement: <
				const TOperation extends DatabaseMutationOperationAst,
			>(
				operation: TOperation,
				replacement: unknown,
			): TOperation => {
				const snapshot = snapshotOperationShape(operation, replacement)
				const original: unknown = operation
				const candidate: unknown = snapshot

				if (
					isPlainRecord(original) &&
					isPlainRecord(candidate) &&
					Object.hasOwn(original, 'query') &&
					!isDeepStrictEqual(original.query, candidate.query)
				) {
					return throwBoundaryIssue(
						['operation', 'query'],
						'ResolveInput must retain the prepared mutation target',
					)
				}

				if (
					operation.kind === 'upsert-one' &&
					isPlainRecord(original) &&
					isPlainRecord(candidate) &&
					!isDeepStrictEqual(original.target, candidate.target)
				) {
					return throwBoundaryIssue(
						['operation', 'target'],
						'ResolveInput must retain the prepared upsert conflict target',
					)
				}

				return snapshot
			},
			snapshotDatabaseResultReplacement: <
				const TOperation extends DatabaseOperationAst,
			>(
				operation: TOperation,
				replacement: unknown,
				selectedFieldsOverride?: readonly string[],
			): DatabaseOperationResult<TOperation> => {
				const { selectedFields } = readBoundaryContext(
					operation,
					selectedFieldsOverride,
				)

				return snapshotIncludedResult(
					operation,
					replacement,
					selectedFields,
					false,
				)
			},
			snapshotResultReplacement: <
				const TOperation extends DatabaseOperationAst,
			>(
				operation: TOperation,
				replacement: unknown,
				selectedFieldsOverride?: readonly string[],
			): RuntimeOperationResult<TOperation> => {
				const { selectedFields } = readBoundaryContext(
					operation,
					selectedFieldsOverride,
				)

				return snapshotIncludedResult(
					operation,
					replacement,
					selectedFields,
					true,
				) as unknown as RuntimeOperationResult<TOperation>
			},
		})
	}

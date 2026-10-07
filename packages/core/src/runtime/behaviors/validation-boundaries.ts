import { isDeepStrictEqual } from 'node:util'
import { Pointer, type ValidationIssuePath } from '../../schema/index.js'
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
import {
	resolveSelectedFields,
	transferRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import {
	readRuntimeValidationPlans,
	snapshotRuntimeMutationOperation,
} from '../validation/runtime-validation.js'
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
	assertOutcomeCardinality,
	assertSameQueryResultShape,
	behaviorBoundaryErrorDescription,
	readOperationKeys,
	readOperationSchema,
	readSelectedFields,
	snapshotBoundaryValue,
	snapshotMaterialization,
	throwBoundaryIssue,
} from './validation-boundary-helpers.js'

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

const schemaPath: ValidationIssuePath = immutableArray(['operation', 'schema'])

const snapshotOperationShape = <const TOperation extends DatabaseOperationAst>(
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
		operation.kind === 'create-one' ? ['inclusion'] : [],
	)

	if (
		readOperationSchema(operation, schemaPath) !==
		readOperationSchema(replacement, schemaPath)
	) {
		return throwBoundaryIssue(
			schemaPath,
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
	const schema = readOperationSchema(operation, schemaPath)
	const inclusions = readInclusions(operation)
	const snapshotParent = (candidate: unknown) =>
		snapshotRuntimeBoundaryRecord(
			schema,
			readRuntimeValidationPlans(schema),
			candidate,
			path,
			resolveSelectedFields(value, selectedFields),
			behaviorBoundaryErrorDescription,
			includeVirtuals,
		)

	if (inclusions.length === 0 || !isPlainRecord(value)) {
		return snapshotParent(value)
	}

	const parentCandidate: Record<string, unknown> = { ...value }
	const hydratedTargets = new Map<string, unknown>()

	for (const inclusion of inclusions) {
		const targetValue: unknown = value[inclusion.field]
		const targetPath = [...path, inclusion.field]
		const targetOperation = createInclusionOperation(inclusion)
		const targetSchema = readOperationSchema(targetOperation, targetPath)
		const snapshotTarget = (target: unknown, itemPath: ValidationIssuePath) =>
			snapshotIncludedRecord(
				targetOperation,
				target,
				itemPath,
				readSelectedFields(targetOperation, targetSchema),
				includeVirtuals,
			)

		if (inclusion.kind === 'pointer') {
			if (targetValue !== null && !isPlainRecord(targetValue)) continue

			hydratedTargets.set(
				inclusion.field,
				targetValue === null ? null : snapshotTarget(targetValue, targetPath),
			)
			// Parent validation still proves that the declared field itself is a pointer.
			parentCandidate[inclusion.field] = new Pointer(
				targetSchema,
				'__ultimabase_hook_boundary__',
			)
		} else {
			if (!isUnknownArray(targetValue)) continue

			hydratedTargets.set(
				inclusion.field,
				immutableArray(
					targetValue.map((target, index) =>
						snapshotTarget(target, [...targetPath, index]),
					),
				),
			)
			// Relation fields are handle-only unless this exact result included them.
			Reflect.deleteProperty(parentCandidate, inclusion.field)
		}
	}

	const parent = snapshotParent(parentCandidate)

	// The placeholder pointer exists only for structural validation. Restore the
	// source record's private identity and declared pointer values on its snapshot.
	transferRuntimeSchemaModelMetadata(value, parent)

	if (hydratedTargets.size === 0) return parent

	const snapshot = immutableRecord({
		...parent,
		...Object.fromEntries(hydratedTargets),
	})

	transferRuntimeSchemaModelMetadata(parent, snapshot)

	return snapshot
}

const readSelection = (
	operation: DatabaseOperationAst,
	selectedFieldsOverride: readonly string[] | undefined,
): readonly string[] | undefined =>
	selectedFieldsOverride ??
	readSelectedFields(operation, readOperationSchema(operation, schemaPath))

const snapshotIncludedResult = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	replacement: unknown,
	selectedFieldsOverride: readonly string[] | undefined,
	includeVirtuals: boolean,
): DatabaseOperationResult<TOperation> => {
	const selectedFields = readSelection(operation, selectedFieldsOverride)
	const schema = readOperationSchema(operation, schemaPath)
	const included = readInclusions(operation).length > 0

	return snapshotRuntimeBoundaryResult(
		operation,
		replacement,
		['result'],
		behaviorBoundaryErrorDescription,
		(value, path) =>
			included
				? snapshotIncludedRecord(
						operation,
						value,
						path,
						selectedFields,
						includeVirtuals,
					)
				: snapshotRuntimeBoundaryRecord(
						schema,
						readRuntimeValidationPlans(schema),
						value,
						path,
						selectedFields,
						behaviorBoundaryErrorDescription,
						includeVirtuals,
					),
	)
}

const snapshotAdapterRecord =
	(operation: DatabaseOperationAst, selectedFields?: readonly string[]) =>
	(value: unknown, path: ValidationIssuePath) => {
		const schema = readOperationSchema(operation, schemaPath)
		return snapshotRuntimeBoundaryRecord(
			schema,
			readRuntimeValidationPlans(schema),
			value,
			path,
			selectedFields,
			adapterBoundaryErrorDescription,
			false,
		)
	}

const boundaryMethods: RuntimeBehaviorBoundaries = {
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

		const result = snapshotRuntimeBoundaryResult(
			operation,
			outcome.result,
			['outcome', 'result'],
			adapterBoundaryErrorDescription,
			snapshotAdapterRecord(
				operation,
				readSelection(operation, selectedFieldsOverride),
			),
		)
		assertOutcomeCardinality(operation, result, outcome.materializations)
		const materializations = immutableArray(
			outcome.materializations.map((materialization, index) =>
				snapshotMaterialization(
					operation,
					materialization,
					snapshotAdapterRecord(operation),
					['outcome', 'materializations', index],
				),
			),
		)

		return immutableRecord({
			materializations,
			result,
		}) as DatabaseOperationOutcome<TOperation>
	},
	snapshotOperationReplacement: <const TOperation extends DatabaseOperationAst>(
		operation: TOperation,
		replacement: unknown,
	): TOperation => {
		const snapshot = snapshotOperationShape(operation, replacement)

		if (
			!isRuntimeMutationOperation(operation) ||
			!isRuntimeMutationOperation(snapshot)
		) {
			return snapshot
		}

		return snapshotRuntimeMutationOperation(
			operation,
			snapshot,
			readRuntimeValidationPlans(readOperationSchema(snapshot, schemaPath)),
		)
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

		if (!isPlainRecord(original) || !isPlainRecord(candidate)) return snapshot

		if (
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
	): DatabaseOperationResult<TOperation> =>
		snapshotIncludedResult(
			operation,
			replacement,
			selectedFieldsOverride,
			false,
		),
	snapshotResultReplacement: <const TOperation extends DatabaseOperationAst>(
		operation: TOperation,
		replacement: unknown,
		selectedFieldsOverride?: readonly string[],
	): RuntimeOperationResult<TOperation> =>
		snapshotIncludedResult(
			operation,
			replacement,
			selectedFieldsOverride,
			true,
		) as unknown as RuntimeOperationResult<TOperation>,
}

/** Creates immutable boundaries; compiled validation plans are cached per schema. */
export const createRuntimeBehaviorBoundaries = (): RuntimeBehaviorBoundaries =>
	immutableRecord({ ...boundaryMethods })

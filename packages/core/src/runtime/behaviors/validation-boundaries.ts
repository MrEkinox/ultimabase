import type { OperationKind } from '../../query/index.js'
import { isDeepStrictEqual } from 'node:util'
import {
	compileValidationPlans,
	Pointer,
	Schema,
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
import { getOperationSchema } from '../operations/schema.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import {
	revalidateRuntimeMutationOperation,
	snapshotRuntimeResultRecord,
	throwRuntimeValidationIssues,
	type RuntimeValidationErrorDescription,
	type RuntimeValidationIssue,
} from '../validation/runtime-validation.js'
import {
	createInclusionOperation,
	readInclusions,
} from '../relations/inclusion.js'

const mutationKinds = new Set<OperationKind>([
	'create-many',
	'create-one',
	'delete-many',
	'delete-one',
	'update-many',
	'update-one',
	'upsert-many',
	'upsert-one',
])

const scalarResultKinds = new Set<OperationKind>(['count', 'exists'])

const nullableResultKinds = new Set<OperationKind>([
	'delete-one',
	'find-one',
	'get',
	'update-one',
])

const collectionResultKinds = new Set<OperationKind>([
	'create-many',
	'delete-many',
	'find-many',
	'update-many',
	'upsert-many',
])

const behaviorBoundaryErrorDescription: Readonly<RuntimeValidationErrorDescription> =
	immutableRecord({
		internalMessage: 'Runtime behavior boundary validation failed.',
		publicMessage: 'A Runtime behavior returned an invalid value.',
	})

const adapterBoundaryErrorDescription: Readonly<RuntimeValidationErrorDescription> =
	immutableRecord({
		internalMessage: 'Database adapter outcome validation failed.',
		publicMessage: 'The database operation returned an invalid result.',
	})

const createBoundaryIssue = (
	path: ValidationIssuePath,
	message: string,
): RuntimeValidationIssue =>
	immutableRecord({
		code: 'runtime.behavior-boundary.invalid',
		message,
		path: immutableArray(path),
	})

const throwBoundaryIssue = (
	path: ValidationIssuePath,
	message: string,
	description: Readonly<RuntimeValidationErrorDescription> = behaviorBoundaryErrorDescription,
): never =>
	throwRuntimeValidationIssues(
		[createBoundaryIssue(path, message)],
		description,
	)

const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription> = behaviorBoundaryErrorDescription,
	optionalKeys: readonly string[] = immutableArray([]),
): void => {
	const expectedKeys = new Set([...keys, ...optionalKeys])

	for (const key of Object.keys(value)) {
		if (!expectedKeys.has(key)) {
			throwBoundaryIssue(
				[...path, key],
				'Property is not part of this boundary contract',
				description,
			)
		}
	}

	for (const key of keys) {
		if (!Object.hasOwn(value, key)) {
			throwBoundaryIssue(
				[...path, key],
				'Required boundary property is missing',
				description,
			)
		}
	}
}

const readOptionalOperationKeys = (kind: OperationKind): readonly string[] =>
	kind === 'create-one' ? immutableArray(['inclusion']) : immutableArray([])

const isMutationOperation = (
	operation: DatabaseOperationAst,
): operation is DatabaseMutationOperationAst =>
	mutationKinds.has(operation.kind)

const readOperationSchema = (
	operation: unknown,
	path: ValidationIssuePath,
): SchemaDefinition => {
	let value: unknown

	try {
		value = getOperationSchema(operation)
	} catch {
		return throwBoundaryIssue(path, 'Operation must retain a normalized schema')
	}

	if (!Schema.is(value)) {
		return throwBoundaryIssue(path, 'Operation must retain a declared schema')
	}

	return value
}

const readOperationKeys = (kind: OperationKind): readonly string[] => {
	switch (kind) {
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
			return ['kind', 'query']
		case 'get':
			return ['kind', 'query', 'id']
		case 'create-one':
			return ['kind', 'schema', 'input', 'selection']
		case 'create-many':
			return ['kind', 'schema', 'inputs', 'selection']
		case 'update-many':
		case 'update-one':
			return ['kind', 'query', 'update']
		case 'upsert-one':
			return ['kind', 'query', 'target', 'create', 'update']
		case 'upsert-many':
			return ['kind', 'schema', 'items', 'selection']
	}
}

const assertSameQueryResultShape = (
	operation: DatabaseOperationAst,
	replacement: Readonly<Record<string, unknown>>,
): void => {
	const original: unknown = operation

	if (
		isPlainRecord(original) &&
		(original.kind === 'create-one' ||
			original.kind === 'create-many' ||
			original.kind === 'upsert-many')
	) {
		if (!isDeepStrictEqual(original.selection, replacement.selection)) {
			throwBoundaryIssue(
				['operation', 'selection'],
				'Runtime behavior must retain the exact create selection',
			)
		}

		if (
			original.kind === 'create-one' &&
			!isDeepStrictEqual(original.inclusion, replacement.inclusion)
		) {
			throwBoundaryIssue(
				['operation', 'inclusion'],
				'Runtime behavior must retain the exact create inclusion',
			)
		}

		return
	}

	if (
		!isPlainRecord(original) ||
		!isPlainRecord(original.query) ||
		!isPlainRecord(replacement.query)
	) {
		return
	}

	if (
		!isDeepStrictEqual(original.query.selection, replacement.query.selection)
	) {
		throwBoundaryIssue(
			['operation', 'query', 'selection'],
			'Runtime behavior must retain the exact query selection',
		)
	}

	if (
		!isDeepStrictEqual(original.query.inclusion, replacement.query.inclusion)
	) {
		throwBoundaryIssue(
			['operation', 'query', 'inclusion'],
			'Runtime behavior must retain the exact query inclusion',
		)
	}
}

const snapshotBoundaryValue = (
	value: unknown,
	path: ValidationIssuePath,
	ancestors: WeakSet<object>,
): unknown => {
	if (isUnknownArray(value)) {
		if (ancestors.has(value)) {
			return throwBoundaryIssue(path, 'Boundary value cannot contain a cycle')
		}

		ancestors.add(value)

		try {
			return immutableArray(
				value.map((item, index) =>
					snapshotBoundaryValue(item, [...path, index], ancestors),
				),
			)
		} finally {
			ancestors.delete(value)
		}
	}

	if (!isPlainRecord(value)) {
		// Schema definitions and scalar capabilities retain identity outside plain AST data.
		return value
	}

	if (ancestors.has(value)) {
		return throwBoundaryIssue(path, 'Boundary value cannot contain a cycle')
	}

	ancestors.add(value)

	try {
		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).map(([key, item]) => [
					key,
					snapshotBoundaryValue(item, [...path, key], ancestors),
				]),
			),
		)
	} finally {
		ancestors.delete(value)
	}
}

const readSelectedFields = (
	operation: DatabaseOperationAst,
	schema: SchemaDefinition,
): readonly string[] | undefined => {
	const candidate: unknown = operation

	if (!isPlainRecord(candidate)) {
		return undefined
	}
	const selectionPath: ValidationIssuePath =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? ['operation', 'selection']
			: ['operation', 'query', 'selection']
	const selection: unknown =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? candidate.selection
			: isPlainRecord(candidate.query)
				? candidate.query.selection
				: undefined

	if (selection === undefined) {
		return undefined
	}

	if (!isPlainRecord(selection) || !isUnknownArray(selection.fields)) {
		return throwBoundaryIssue(
			selectionPath,
			'Operation selection must be normalized',
		)
	}

	const selectedFields: string[] = []

	for (const [index, selected] of selection.fields.entries()) {
		if (
			!isPlainRecord(selected) ||
			selected.kind !== 'selected-field' ||
			typeof selected.field !== 'string' ||
			!Object.hasOwn(schema.fields, selected.field)
		) {
			return throwBoundaryIssue(
				[...selectionPath, 'fields', index],
				'Selected field must reference the operation schema',
			)
		}

		selectedFields.push(selected.field)
	}

	return selectedFields.length === 0
		? undefined
		: immutableArray(selectedFields)
}

const snapshotRecordResult = (
	plans: SchemaValidationPlans,
	value: unknown,
	path: ValidationIssuePath,
	selectedFields: readonly string[] | undefined,
	description: Readonly<RuntimeValidationErrorDescription> = behaviorBoundaryErrorDescription,
): Readonly<Record<string, unknown>> => {
	const snapshot = snapshotRuntimeResultRecord(
		plans,
		value,
		path,
		selectedFields,
		description,
	)

	if (isPlainRecord(value)) {
		// Protected model identity follows immutable snapshots without becoming data.
		transferRuntimeSchemaModelMetadata(value, snapshot)
	}

	return snapshot
}

const snapshotOperationResult = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	value: unknown,
	plans: SchemaValidationPlans,
	selectedFields: readonly string[] | undefined,
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription> = behaviorBoundaryErrorDescription,
): DatabaseOperationResult<TOperation> => {
	if (scalarResultKinds.has(operation.kind)) {
		if (operation.kind === 'exists') {
			if (typeof value !== 'boolean') {
				return throwBoundaryIssue(
					path,
					'Exists result must be a boolean',
					description,
				)
			}
		} else if (
			typeof value !== 'number' ||
			!Number.isSafeInteger(value) ||
			value < 0
		) {
			return throwBoundaryIssue(
				path,
				'Count result must be a non-negative safe integer',
				description,
			)
		}

		return value as DatabaseOperationResult<TOperation>
	}

	if (value === null) {
		if (!nullableResultKinds.has(operation.kind)) {
			return throwBoundaryIssue(
				path,
				'This terminal cannot return null',
				description,
			)
		}

		return null as DatabaseOperationResult<TOperation>
	}

	if (collectionResultKinds.has(operation.kind)) {
		if (!isUnknownArray(value)) {
			return throwBoundaryIssue(
				path,
				'This terminal must return an array',
				description,
			)
		}

		return immutableArray(
			value.map((item, index) =>
				snapshotRecordResult(
					plans,
					item,
					[...path, index],
					selectedFields,
					description,
				),
			),
		) as DatabaseOperationResult<TOperation>
	}

	return snapshotRecordResult(
		plans,
		value,
		path,
		selectedFields,
		description,
	) as DatabaseOperationResult<TOperation>
}

type MaterializationKind = 'create' | 'delete' | 'update'

const allowedMaterializationKinds = (
	operation: DatabaseMutationOperationAst,
): readonly MaterializationKind[] => {
	switch (operation.kind) {
		case 'create-many':
		case 'create-one':
			return ['create']
		case 'delete-one':
		case 'delete-many':
			return ['delete']
		case 'update-many':
		case 'update-one':
			return ['update']
		case 'upsert-many':
		case 'upsert-one':
			return ['create', 'update']
	}
}

const snapshotMaterialization = (
	operation: DatabaseMutationOperationAst,
	value: unknown,
	plans: SchemaValidationPlans,
	path: ValidationIssuePath,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		return throwBoundaryIssue(
			path,
			'Materialization must be a plain object',
			adapterBoundaryErrorDescription,
		)
	}

	const allowedKinds = allowedMaterializationKinds(operation)

	if (
		typeof value.kind !== 'string' ||
		!allowedKinds.includes(value.kind as MaterializationKind)
	) {
		return throwBoundaryIssue(
			[...path, 'kind'],
			'Materialization branch is incompatible with the operation terminal',
			adapterBoundaryErrorDescription,
		)
	}

	if (value.kind === 'create') {
		assertExactKeys(
			value,
			['kind', 'current'],
			path,
			adapterBoundaryErrorDescription,
		)

		return immutableRecord({
			current: snapshotRecordResult(
				plans,
				value.current,
				[...path, 'current'],
				undefined,
				adapterBoundaryErrorDescription,
			),
			kind: 'create',
		})
	}

	if (value.kind === 'delete') {
		assertExactKeys(
			value,
			['kind', 'previous'],
			path,
			adapterBoundaryErrorDescription,
		)

		return immutableRecord({
			kind: 'delete',
			previous: snapshotRecordResult(
				plans,
				value.previous,
				[...path, 'previous'],
				undefined,
				adapterBoundaryErrorDescription,
			),
		})
	}

	assertExactKeys(
		value,
		['kind', 'previous', 'current'],
		path,
		adapterBoundaryErrorDescription,
	)

	return immutableRecord({
		current: snapshotRecordResult(
			plans,
			value.current,
			[...path, 'current'],
			undefined,
			adapterBoundaryErrorDescription,
		),
		kind: 'update',
		previous: snapshotRecordResult(
			plans,
			value.previous,
			[...path, 'previous'],
			undefined,
			adapterBoundaryErrorDescription,
		),
	})
}

const assertOutcomeCardinality = (
	operation: DatabaseMutationOperationAst,
	result: unknown,
	materializations: readonly unknown[],
): void => {
	let expected: number | undefined

	switch (operation.kind) {
		case 'create-one':
		case 'upsert-one':
			expected = 1
			break
		case 'delete-one':
		case 'update-one':
			expected = result === null ? 0 : 1
			break
		case 'delete-many':
		case 'update-many':
			// Adapters keep the fast path empty unless installed behaviors requested snapshots.
			if (materializations.length === 0) return
			expected = isUnknownArray(result) ? result.length : undefined
			break
		case 'create-many':
		case 'upsert-many':
			expected = isUnknownArray(result) ? result.length : undefined
			break
	}

	if (expected !== undefined && materializations.length !== expected) {
		throwBoundaryIssue(
			['outcome', 'materializations'],
			`Expected ${String(expected)} materialization(s) for ${operation.kind}`,
			adapterBoundaryErrorDescription,
		)
	}
}

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
		): Readonly<Record<string, unknown>> => {
			const schema = readOperationSchema(operation, ['operation', 'schema'])
			const inclusions = readInclusions(operation)

			if (inclusions.length === 0 || !isPlainRecord(value)) {
				return snapshotRecordResult(
					readPlans(schema),
					value,
					path,
					selectedFields,
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
							),
						),
					)
					// Relation fields are handle-only unless this exact result included them.
					Reflect.deleteProperty(parentCandidate, inclusion.field)
				}

				hydratedTargets.set(inclusion.field, targetSnapshot)
			}

			const parent = snapshotRecordResult(
				readPlans(schema),
				parentCandidate,
				path,
				selectedFields,
			)

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

		const snapshotIncludedResult = <
			const TOperation extends DatabaseOperationAst,
		>(
			operation: TOperation,
			replacement: unknown,
			selectedFields: readonly string[] | undefined,
		): DatabaseOperationResult<TOperation> => {
			if (readInclusions(operation).length === 0) {
				return snapshotOperationResult(
					operation,
					replacement,
					readPlans(readOperationSchema(operation, ['operation', 'schema'])),
					selectedFields,
					['result'],
				)
			}

			if (replacement === null) {
				if (!nullableResultKinds.has(operation.kind)) {
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
						),
					),
				) as DatabaseOperationResult<TOperation>
			}

			return snapshotIncludedRecord(
				operation,
				replacement,
				['result'],
				selectedFields,
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

				const { plans, selectedFields } = readBoundaryContext(operation)
				const result = snapshotOperationResult(
					operation,
					outcome.result,
					plans,
					selectedFields,
					['outcome', 'result'],
					adapterBoundaryErrorDescription,
				)

				assertOutcomeCardinality(operation, result, outcome.materializations)

				const materializations = immutableArray(
					outcome.materializations.map((materialization, index) =>
						snapshotMaterialization(operation, materialization, plans, [
							'outcome',
							'materializations',
							index,
						]),
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

				return revalidateRuntimeMutationOperation(operation, snapshot, plans)
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

				return snapshotIncludedResult(operation, replacement, selectedFields)
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

				// Inclusion-aware validation produces the post-hydration record contract.
				return snapshotIncludedResult(
					operation,
					replacement,
					selectedFields,
				) as unknown as RuntimeOperationResult<TOperation>
			},
		})
	}

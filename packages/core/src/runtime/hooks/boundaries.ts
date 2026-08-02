import type { OperationKind } from '../../query/index.js'
import {
	compileValidationPlans,
	Schema,
	type HookValidationIssue,
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
import { getOperationSchema } from '../operations/schema.js'
import {
	revalidateRuntimeMutationOperation,
	snapshotRuntimeResultRecord,
	throwRuntimeValidationIssues,
	type RuntimeValidationErrorDescription,
	type RuntimeValidationIssue,
} from '../validation/runtime-validation.js'

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

const scalarResultKinds = new Set<OperationKind>([
	'count',
	'delete-many',
	'exists',
	'update-many',
])

const nullableResultKinds = new Set<OperationKind>([
	'delete-one',
	'first',
	'get',
	'update-one',
])

const collectionResultKinds = new Set<OperationKind>([
	'create-many',
	'find',
	'upsert-many',
])

const hookBoundaryErrorDescription: Readonly<RuntimeValidationErrorDescription> =
	immutableRecord({
		internalMessage: 'Hook boundary validation failed.',
		publicMessage: 'A hook returned an invalid value.',
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
		code: 'runtime.hook-boundary.invalid',
		message,
		path: immutableArray(path),
	})

const throwBoundaryIssue = (
	path: ValidationIssuePath,
	message: string,
	description: Readonly<RuntimeValidationErrorDescription> = hookBoundaryErrorDescription,
): never =>
	throwRuntimeValidationIssues(
		[createBoundaryIssue(path, message)],
		description,
	)

const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription> = hookBoundaryErrorDescription,
): void => {
	const expectedKeys = new Set(keys)

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
		case 'find':
		case 'first':
			return ['kind', 'query']
		case 'get':
			return ['kind', 'query', 'id']
		case 'create-one':
			return ['kind', 'schema', 'input']
		case 'create-many':
			return ['kind', 'schema', 'inputs', 'options']
		case 'update-many':
		case 'update-one':
			return ['kind', 'query', 'update']
		case 'upsert-one':
			return ['kind', 'query', 'target', 'create', 'update']
		case 'upsert-many':
			return ['kind', 'schema', 'items', 'options']
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

	if (!isPlainRecord(candidate) || !isPlainRecord(candidate.query)) {
		return undefined
	}

	const selection: unknown = candidate.query.selection

	if (!isPlainRecord(selection) || !isUnknownArray(selection.fields)) {
		return throwBoundaryIssue(
			['operation', 'query', 'selection'],
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
				['operation', 'query', 'selection', 'fields', index],
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
	description: Readonly<RuntimeValidationErrorDescription> = hookBoundaryErrorDescription,
): Readonly<Record<string, unknown>> =>
	snapshotRuntimeResultRecord(plans, value, path, selectedFields, description)

const snapshotOperationResult = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	value: unknown,
	plans: SchemaValidationPlans,
	selectedFields: readonly string[] | undefined,
	path: ValidationIssuePath,
	description: Readonly<RuntimeValidationErrorDescription> = hookBoundaryErrorDescription,
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
			return ['delete']
		case 'update-one':
			return ['update']
		case 'upsert-many':
		case 'upsert-one':
			return ['create', 'update']
		case 'delete-many':
		case 'update-many':
			return []
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
			expected = 0
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

/** Owns immutable validation boundaries shared by every native hook phase. */
export interface RuntimeHookBoundaries {
	/** Snapshots a replacement while preserving its exact terminal and schema identity. */
	snapshotOperationReplacement<const TOperation extends DatabaseOperationAst>(
		operation: TOperation,
		replacement: unknown,
	): TOperation

	/** Validates one hook-transformed result against its terminal and selection. */
	snapshotResultReplacement<const TOperation extends DatabaseOperationAst>(
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

	/** Converts accumulated business issues into one immutable framework error. */
	throwHookValidationIssues(
		issues: readonly HookValidationIssue[],
		path?: ValidationIssuePath,
	): void
}

/** Creates one application-scoped cache for hook boundary validation plans. */
export const createRuntimeHookBoundaries = (): RuntimeHookBoundaries => {
	const plansBySchema = new WeakMap<object, SchemaValidationPlans>()

	const readBoundaryContext = (
		operation: DatabaseOperationAst,
		selectedFieldsOverride?: readonly string[],
	): Readonly<{
		readonly plans: SchemaValidationPlans
		readonly schema: SchemaDefinition
		readonly selectedFields: readonly string[] | undefined
	}> => {
		const schema = readOperationSchema(operation, ['operation', 'schema'])
		let plans = plansBySchema.get(schema)

		if (plans === undefined) {
			plans = compileValidationPlans(schema)
			plansBySchema.set(schema, plans)
		}

		return immutableRecord({
			plans,
			schema,
			selectedFields:
				selectedFieldsOverride ?? readSelectedFields(operation, schema),
		})
	}

	return immutableRecord({
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
			if (!isPlainRecord(replacement)) {
				return throwBoundaryIssue(
					['operation'],
					'Hook operation replacement must be a plain object',
				)
			}

			if (replacement.kind !== operation.kind) {
				return throwBoundaryIssue(
					['operation', 'kind'],
					`Hook must retain terminal ${operation.kind}`,
				)
			}

			assertExactKeys(replacement, readOperationKeys(operation.kind), [
				'operation',
			])

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
					'Hook must retain the exact schema identity',
				)
			}

			const snapshot = snapshotBoundaryValue(
				replacement,
				['operation'],
				new WeakSet<object>(),
			) as TOperation

			if (!isMutationOperation(operation) || !isMutationOperation(snapshot)) {
				return snapshot
			}

			const { plans } = readBoundaryContext(snapshot)

			return revalidateRuntimeMutationOperation(operation, snapshot, plans)
		},
		snapshotResultReplacement: <const TOperation extends DatabaseOperationAst>(
			operation: TOperation,
			replacement: unknown,
			selectedFieldsOverride?: readonly string[],
		): DatabaseOperationResult<TOperation> => {
			const { plans, selectedFields } = readBoundaryContext(
				operation,
				selectedFieldsOverride,
			)

			return snapshotOperationResult(
				operation,
				replacement,
				plans,
				selectedFields,
				['result'],
			)
		},
		throwHookValidationIssues: (
			issues: readonly HookValidationIssue[],
			path: ValidationIssuePath = [],
		): void => {
			if (issues.length === 0) {
				return
			}

			throwRuntimeValidationIssues(
				issues.map((issue) =>
					immutableRecord({
						...issue,
						path: immutableArray([...path, ...issue.path]),
					}),
				),
				hookBoundaryErrorDescription,
			)
		},
	})
}

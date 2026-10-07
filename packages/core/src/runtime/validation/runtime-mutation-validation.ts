import { isDeepStrictEqual } from 'node:util'
import {
	Pointer,
	type FieldValidationPlan,
	type SchemaValidationPlan,
	type ValidationIssuePath,
} from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type {
	QueryAst,
	UniqueUpsertTargetNode,
	UpdateExpressionNode,
} from '../../query/index.js'
import {
	appendIssue,
	snapshotScalarValue,
	validateFieldValue,
	validateSchemaInput,
	type ValidationExecution,
} from './runtime-field-validation.js'
import { readUniqueUpsertTargetValues } from '../../query/operations/upsert.js'

const updateKinds: ReadonlySet<string> = new Set([
	'decrement',
	'increment',
	'set',
])

const relationMutationActions: ReadonlySet<string> = new Set([
	'clear',
	'connect',
	'disconnect',
	'set',
])

/** Validates one relation delta without routing it through scalar snapshots. */
const validateRelationUpdateOperation = (
	candidate: Readonly<Record<string, unknown>>,
	fieldPlan: FieldValidationPlan,
	path: ValidationIssuePath,
	execution: ValidationExecution,
): Readonly<Record<string, unknown>> | undefined => {
	if (
		fieldPlan.field.kind !== 'relation' ||
		Object.keys(candidate).some(
			(key) => key !== 'field' && key !== 'kind' && key !== 'value',
		) ||
		!Object.hasOwn(candidate, 'value') ||
		!isPlainRecord(candidate.value) ||
		Object.keys(candidate.value).some(
			(key) => key !== 'action' && key !== 'targets',
		) ||
		typeof candidate.value.action !== 'string' ||
		!relationMutationActions.has(candidate.value.action) ||
		!isUnknownArray(candidate.value.targets)
	) {
		appendIssue(
			execution,
			'object.type',
			path,
			'Relation update operation is invalid',
		)

		return undefined
	}

	const action = candidate.value.action
	const suppliedTargets = candidate.value.targets

	if (
		(action === 'clear' && suppliedTargets.length !== 0) ||
		((action === 'connect' || action === 'disconnect') &&
			suppliedTargets.length === 0)
	) {
		appendIssue(
			execution,
			'object.type',
			[...path, 'value', 'targets'],
			'Relation mutation target count is incompatible with its action',
		)

		return undefined
	}

	const target = getFieldSchemaTarget(fieldPlan.field)?.()
	const ids = new Set<string>()
	const targets: Pointer[] = []

	for (const [index, pointer] of suppliedTargets.entries()) {
		if (
			!Pointer.is(pointer) ||
			pointer.schema !== target ||
			ids.has(pointer.id)
		) {
			appendIssue(
				execution,
				'object.type',
				[...path, 'value', 'targets', index],
				'Relation mutation target is invalid or duplicated',
			)
			continue
		}

		ids.add(pointer.id)
		targets.push(pointer)
	}

	if (targets.length !== suppliedTargets.length) {
		return undefined
	}

	return immutableRecord({
		field: candidate.field,
		kind: 'relation' as const,
		value: immutableRecord({ action, targets: immutableArray(targets) }),
	})
}

/** Compares relation identities explicitly because private Pointer state is opaque to deep equality. */
const isSameRelationUpdateOperation = (
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean => {
	if (
		left.kind !== 'relation' ||
		right.kind !== 'relation' ||
		left.field !== right.field ||
		!isPlainRecord(left.value) ||
		!isPlainRecord(right.value) ||
		left.value.action !== right.value.action ||
		!isUnknownArray(left.value.targets) ||
		!isUnknownArray(right.value.targets) ||
		left.value.targets.length !== right.value.targets.length
	) {
		return false
	}
	const previousTargets = right.value.targets

	return left.value.targets.every((pointer, index) => {
		const previousPointer: unknown = previousTargets[index]

		return Pointer.is(pointer) && pointer.equals(previousPointer)
	})
}

export const validateUpdateExpression = (
	plan: SchemaValidationPlan,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	appendGeneratedValues: boolean,
	previousValue?: unknown,
): UpdateExpressionNode | undefined => {
	if (
		!isPlainRecord(value) ||
		value.kind !== 'update-expression' ||
		!isUnknownArray(value.operations)
	) {
		appendIssue(
			execution,
			'object.type',
			path,
			'Update must be a normalized update expression',
		)

		return undefined
	}

	const operations: Readonly<Record<string, unknown>>[] = []
	const retainedForbiddenOperations = new Map<
		string,
		Readonly<Record<string, unknown>>
	>()
	const observedForbiddenFields = new Set<string>()

	if (
		isPlainRecord(previousValue) &&
		isUnknownArray(previousValue.operations)
	) {
		for (const candidate of previousValue.operations) {
			if (
				isPlainRecord(candidate) &&
				typeof candidate.field === 'string' &&
				plan.fields[candidate.field]?.presence === 'forbidden'
			) {
				retainedForbiddenOperations.set(candidate.field, candidate)
			}
		}
	}

	for (const [index, candidate] of value.operations.entries()) {
		const operationPath: ValidationIssuePath = [...path, index]

		if (
			!isPlainRecord(candidate) ||
			typeof candidate.kind !== 'string' ||
			(!updateKinds.has(candidate.kind) && candidate.kind !== 'relation') ||
			typeof candidate.field !== 'string'
		) {
			appendIssue(
				execution,
				'object.type',
				operationPath,
				'Update operation is invalid',
			)
			continue
		}

		const expectedKeys = new Set(['field', 'kind', 'value'])

		if (
			Object.keys(candidate).some((key) => !expectedKeys.has(key)) ||
			[...expectedKeys].some((key) => !Object.hasOwn(candidate, key))
		) {
			appendIssue(
				execution,
				'object.type',
				operationPath,
				'Update operation contains incompatible properties',
			)
			continue
		}

		const fieldPlan = plan.fields[candidate.field]
		const fieldPath: ValidationIssuePath = [...operationPath, candidate.field]

		if (fieldPlan === undefined) {
			appendIssue(
				execution,
				'field.unknown',
				fieldPath,
				'Update field is not declared by the schema',
			)
			continue
		}

		if (candidate.kind === 'relation') {
			if (previousValue !== undefined) {
				const retained = retainedForbiddenOperations.get(candidate.field)
				observedForbiddenFields.add(candidate.field)

				if (
					retained === undefined ||
					!isSameRelationUpdateOperation(candidate, retained)
				) {
					appendIssue(
						execution,
						'field.forbidden',
						fieldPath,
						'Relation mutation delta cannot be replaced by a behavior',
					)
					continue
				}
			}

			const relationOperation = validateRelationUpdateOperation(
				candidate,
				fieldPlan,
				operationPath,
				execution,
			)

			if (relationOperation !== undefined) {
				operations.push(relationOperation)
			}
			continue
		}

		if (fieldPlan.presence === 'forbidden') {
			const retained = retainedForbiddenOperations.get(candidate.field)

			if (retained === undefined || !isDeepStrictEqual(candidate, retained)) {
				appendIssue(
					execution,
					'field.forbidden',
					fieldPath,
					'Update field is immutable or generated',
				)
				continue
			}

			// A behavior may retain framework-generated work but cannot remove or replace it.
			observedForbiddenFields.add(candidate.field)
		}

		const valuePath: ValidationIssuePath = [...fieldPath, 'value']
		const fieldResult =
			candidate.kind === 'increment' || candidate.kind === 'decrement'
				? snapshotScalarValue(
						fieldPlan.field,
						candidate.value,
						valuePath,
						execution,
						false,
					)
				: validateFieldValue(
						fieldPlan,
						candidate.value,
						valuePath,
						execution,
						false,
					)

		if (fieldResult.valid) {
			operations.push(
				immutableRecord({ ...candidate, value: fieldResult.value }),
			)
		}
	}

	for (const fieldName of retainedForbiddenOperations.keys()) {
		if (!observedForbiddenFields.has(fieldName)) {
			appendIssue(
				execution,
				'field.required',
				[...path, 'operations', fieldName],
				'Generated update operation must be retained',
			)
		}
	}

	const updatedAtPlan = plan.fields.updatedAt

	if (
		appendGeneratedValues &&
		updatedAtPlan !== undefined &&
		'generatedOn' in updatedAtPlan.field.options &&
		updatedAtPlan.field.options.generatedOn === 'createAndUpdate'
	) {
		operations.push(
			immutableRecord({
				field: 'updatedAt',
				kind: 'set',
				value: execution.temporal.dateTimeWithTimezone,
			}),
		)
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})
}

interface PreparedUpsertCreateInput {
	readonly input: Readonly<Record<string, unknown>>
	readonly targetValues: Readonly<Record<string, unknown>>
}

/** Seeds developer-owned target fields before required-value validation runs. */
const prepareUpsertCreateInput = (
	suppliedCreate: unknown,
	query: unknown,
	target: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	createPlan: SchemaValidationPlan,
): PreparedUpsertCreateInput | undefined => {
	if (!isPlainRecord(query) || !isPlainRecord(target)) {
		appendIssue(
			execution,
			'upsert.target',
			path,
			'Upsert target must contain a normalized query and unique key',
		)

		return undefined
	}

	let targetValues: Readonly<Record<string, unknown>>

	try {
		targetValues = readUniqueUpsertTargetValues(
			query as unknown as QueryAst,
			target as unknown as UniqueUpsertTargetNode,
		)
	} catch {
		appendIssue(
			execution,
			'upsert.target',
			path,
			'Upsert target does not match its equality query',
		)

		return undefined
	}

	if (!isPlainRecord(suppliedCreate)) {
		appendIssue(
			execution,
			'object.type',
			path,
			'Upsert create candidate must be a plain object',
		)

		return undefined
	}

	const input: Record<string, unknown> = { ...suppliedCreate }
	let valid = true

	for (const [fieldName, value] of Object.entries(targetValues)) {
		const fieldPlan = createPlan.fields[fieldName]

		if (fieldPlan === undefined) {
			valid = false
			appendIssue(
				execution,
				'field.unknown',
				[...path, fieldName],
				'Upsert target field is not declared by the schema',
			)
			continue
		}

		if (
			Object.hasOwn(suppliedCreate, fieldName) &&
			!isDeepStrictEqual(suppliedCreate[fieldName], value)
		) {
			valid = false
			appendIssue(
				execution,
				'upsert.target',
				[...path, fieldName],
				'Create value must match its unique upsert target',
			)
		}

		if (fieldPlan.presence !== 'forbidden') {
			// Required developer fields are present before the regular create validator.
			input[fieldName] = value
		}
	}

	if (!valid) {
		return undefined
	}

	return immutableRecord({
		input: immutableRecord(input),
		targetValues,
	})
}

/** Applies every validated target value, including reserved generated identity. */
const reconcileUpsertCreateTarget = (
	create: Readonly<Record<string, unknown>>,
	targetValues: Readonly<Record<string, unknown>>,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	createPlan: SchemaValidationPlan,
): Readonly<Record<string, unknown>> | undefined => {
	const reconciled: Record<string, unknown> = { ...create }
	let valid = true

	for (const [fieldName, value] of Object.entries(targetValues)) {
		const fieldPlan = createPlan.fields[fieldName]

		if (fieldPlan === undefined) {
			valid = false
			continue
		}

		const fieldResult = validateFieldValue(
			fieldPlan,
			value,
			[...path, fieldName],
			execution,
			false,
		)

		if (!fieldResult.valid) {
			valid = false
			continue
		}

		// The query remains authoritative over generated values such as an id.
		reconciled[fieldName] = fieldResult.value
	}

	return valid ? immutableRecord(reconciled) : undefined
}

/** Runs target seeding and ordinary create validation through one shared path. */
export const validateUpsertCreateInput = (
	suppliedCreate: unknown,
	query: unknown,
	target: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	createPlan: SchemaValidationPlan,
	allowDefaults: boolean,
): Readonly<Record<string, unknown>> | undefined => {
	const prepared = prepareUpsertCreateInput(
		suppliedCreate,
		query,
		target,
		path,
		execution,
		createPlan,
	)

	if (prepared === undefined) {
		return undefined
	}

	const validated = validateSchemaInput(
		createPlan,
		prepared.input,
		path,
		execution,
		allowDefaults,
	)

	return validated === undefined
		? undefined
		: reconcileUpsertCreateTarget(
				validated,
				prepared.targetValues,
				path,
				execution,
				createPlan,
			)
}

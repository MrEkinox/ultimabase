import type {
	OperationKind,
	QueryAst,
	UniqueUpsertTargetNode,
	UpdateExpressionNode,
} from '../../query/index.js'
import { readUniqueUpsertTargetValues } from '../../query/operations/upsert.js'
import { isDeepStrictEqual } from 'node:util'
import {
	compileValidationPlans,
	fieldUsesTemporalTimezone,
	Pointer,
	Schema,
	snapshotScalarFieldValue,
	type AnyValidationIssueCode,
	type FieldValidationPlan,
	type GenericField,
	type SchemaDefinition,
	type SchemaValidationPlan,
	type SchemaValidationPlans,
	type ValidationIssue,
	type ValidationIssuePath,
} from '../../schema/index.js'
import { validateScalarFieldShape } from '../../schema/plans/scalar-shape-validation.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { FrameworkError } from '../../foundation.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type { RuntimeOperationTransformStage } from '../pipeline/contracts.js'
import {
	createApplicationTimezoneFormatter,
	projectOperationTemporalValues,
	type OperationTemporalValues,
} from './operation-clock.js'
import { generateUuidV7, type UuidV7Generator } from './identifier-generator.js'
import {
	emptyRuntimeValidationOptions,
	normalizeRuntimeValidationOptions,
	type RuntimeValidationOptions,
} from './runtime-validation-options.js'

export {
	normalizeRuntimeValidationOptions,
	type RuntimeValidationOptions,
} from './runtime-validation-options.js'

interface ValidationExecution {
	readonly issues: ValidationIssue<AnyValidationIssueCode>[]
	readonly temporal: OperationTemporalValues
	readonly timestamp: number
	readonly uuidV7Generator: UuidV7Generator
}

interface ValidValue {
	readonly valid: true
	readonly value: unknown
}

interface InvalidValue {
	readonly valid: false
}

type ValueValidationResult = InvalidValue | ValidValue

interface MissingValue {
	readonly found: false
}

interface ResolvedValue {
	readonly found: true
	readonly value: unknown
}

type MissingValueResolution = MissingValue | ResolvedValue

/** Keeps Runtime validation errors compatible with schema and behavior issue codes. */
export interface RuntimeValidationIssue {
	readonly code: string
	readonly message: string
	readonly path: ValidationIssuePath
}

/** Describes the trusted diagnostic and safe public message for one boundary. */
export interface RuntimeValidationErrorDescription {
	readonly internalMessage: string
	readonly publicMessage: string
}

const mutationKinds = new Set<OperationKind>([
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
])
const updateKinds = new Set(['decrement', 'increment', 'set'])
const relationMutationActions = new Set([
	'clear',
	'connect',
	'disconnect',
	'set',
])

const createIssue = (
	code: AnyValidationIssueCode,
	path: ValidationIssuePath,
	message: string,
): ValidationIssue<AnyValidationIssueCode> =>
	immutableRecord({ code, path: immutableArray(path), message })

const appendIssue = (
	execution: ValidationExecution,
	code: AnyValidationIssueCode,
	path: ValidationIssuePath,
	message: string,
): void => {
	execution.issues.push(createIssue(code, path, message))
}

const readScalarFailureCode = (field: GenericField): AnyValidationIssueCode => {
	switch (field.kind) {
		case 'bigint':
			return 'bigint.type'
		case 'binary':
			return 'binary.type'
		case 'boolean':
			return 'boolean.type'
		case 'date':
			return 'date.invalid'
		case 'dateTime':
			return 'dateTime.invalid'
		case 'decimal':
			return 'decimal.invalid'
		case 'enum':
			return 'enum.value'
		case 'float':
			return 'float.type'
		case 'int':
			return 'int.type'
		case 'json':
			return 'json.type'
		case 'pointer':
			return 'pointer.type'
		case 'string':
			return 'string.type'
		case 'time':
			return 'time.invalid'
		case 'uuid':
			return 'uuid.type'
		default:
			// Plugin field kinds are namespaced, so their generic invalid code remains namespaced.
			return `${field.kind}.invalid` as AnyValidationIssueCode
	}
}

const snapshotScalarValue = (
	field: GenericField,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	constraints: boolean,
): ValueValidationResult => {
	const displayPath = path.map(String).join('.')

	try {
		const snapshot: unknown = snapshotScalarFieldValue(
			field,
			value,
			displayPath,
		)

		if (constraints) {
			execution.issues.push(...validateScalarFieldShape(field, snapshot, path))
		}

		return { valid: true, value: snapshot }
	} catch (error: unknown) {
		appendIssue(
			execution,
			readScalarFailureCode(field),
			path,
			error instanceof Error ? error.message : 'Invalid scalar value',
		)

		return { valid: false }
	}
}

const resolveMissingValue = (
	field: GenericField,
	execution: ValidationExecution,
): MissingValueResolution => {
	if ('default' in field.options) {
		const declaredDefault: unknown = field.options.default

		return {
			found: true,
			value:
				typeof declaredDefault === 'function'
					? (declaredDefault as () => unknown)()
					: declaredDefault,
		}
	}

	if ('autoNow' in field.options && field.options.autoNow === true) {
		const timezone = fieldUsesTemporalTimezone(field)
		const { temporal } = execution

		return {
			found: true,
			value:
				field.kind === 'date'
					? temporal.date
					: field.kind === 'time'
						? timezone
							? temporal.timeWithTimezone
							: temporal.time
						: timezone
							? temporal.dateTimeWithTimezone
							: temporal.dateTime,
		}
	}

	if ('generatedOn' in field.options && field.kind === 'dateTime') {
		return { found: true, value: execution.temporal.dateTimeWithTimezone }
	}

	if (
		'generatedOn' in field.options &&
		field.options.generatedOn === 'create' &&
		field.kind === 'uuid' &&
		'uuidVersion' in field.options &&
		field.options.uuidVersion === 7
	) {
		return {
			found: true,
			value: execution.uuidV7Generator(execution.timestamp),
		}
	}

	// Auto-increment and future database extensions intentionally remain adapter-owned.
	return { found: false }
}

const validateFieldValue = (
	plan: FieldValidationPlan,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	allowDefaults: boolean,
): ValueValidationResult => {
	if (value === null) {
		if (plan.nullable) {
			return { valid: true, value: null }
		}
		appendIssue(execution, 'field.null', path, 'Field cannot be null')
		return { valid: false }
	}
	const result: ValueValidationResult = (() => {
		switch (plan.kind) {
			case 'scalar':
				return snapshotScalarValue(plan.field, value, path, execution, true)
			case 'array': {
				if (!isUnknownArray(value)) {
					appendIssue(execution, 'array.type', path, 'Field must be an array')
					return { valid: false }
				}
				const items: unknown[] = []
				let valid = true
				for (const [index, item] of value.entries()) {
					const itemResult = validateFieldValue(
						plan.items,
						item,
						[...path, index],
						execution,
						allowDefaults,
					)
					valid = valid && itemResult.valid
					if (itemResult.valid) {
						items.push(itemResult.value)
					}
				}
				return valid
					? { valid: true, value: immutableArray(items) }
					: { valid: false }
			}
			case 'object':
				return validateObjectValue(
					plan.fields,
					value,
					path,
					execution,
					allowDefaults,
				)
		}
	})()
	return result
}

const validateObjectValue = (
	fields: Readonly<Record<string, FieldValidationPlan>>,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	allowDefaults: boolean,
): ValueValidationResult => {
	if (!isPlainRecord(value)) {
		appendIssue(execution, 'object.type', path, 'Value must be a plain object')
		return { valid: false }
	}

	let valid = true
	const entries: [string, unknown][] = []

	for (const key of Object.keys(value)) {
		if (!Object.hasOwn(fields, key)) {
			valid = false
			appendIssue(
				execution,
				'field.unknown',
				[...path, key],
				'Field is not declared by the schema',
			)
		}
	}

	for (const [fieldName, plan] of Object.entries(fields)) {
		const fieldPath: ValidationIssuePath = [...path, fieldName]
		const supplied = Object.hasOwn(value, fieldName)

		if (supplied) {
			if (plan.presence === 'forbidden') {
				valid = false
				appendIssue(
					execution,
					'field.forbidden',
					fieldPath,
					'Field is generated or immutable',
				)
				continue
			}

			const fieldResult = validateFieldValue(
				plan,
				value[fieldName],
				fieldPath,
				execution,
				allowDefaults,
			)

			valid = valid && fieldResult.valid

			if (fieldResult.valid) {
				entries.push([fieldName, fieldResult.value])
			}

			continue
		}

		const resolved = allowDefaults
			? resolveMissingValue(plan.field, execution)
			: { found: false as const }

		if (resolved.found) {
			const fieldResult = validateFieldValue(
				plan,
				resolved.value,
				fieldPath,
				execution,
				allowDefaults,
			)

			valid = valid && fieldResult.valid

			if (fieldResult.valid) {
				entries.push([fieldName, fieldResult.value])
			}

			continue
		}

		if (plan.presence === 'required') {
			valid = false
			appendIssue(execution, 'field.required', fieldPath, 'Field is required')
		} else if (plan.presence === 'optional' && allowDefaults && plan.nullable) {
			// Complete create values canonicalize unresolved optional fields to null.
			entries.push([fieldName, null])
		}
	}

	return valid
		? { valid: true, value: immutableRecord(Object.fromEntries(entries)) }
		: { valid: false }
}

const validateSchemaInput = (
	plan: SchemaValidationPlan,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	allowDefaults: boolean,
): Readonly<Record<string, unknown>> | undefined => {
	const result = validateObjectValue(
		plan.fields,
		value,
		path,
		execution,
		allowDefaults,
	)

	return result.valid
		? (result.value as Readonly<Record<string, unknown>>)
		: undefined
}

const isRequiredOutput = (field: GenericField): boolean =>
	('required' in field.options && field.options.required === true) ||
	'default' in field.options ||
	('autoNow' in field.options && field.options.autoNow === true) ||
	('autoIncrement' in field.options && field.options.autoIncrement === true) ||
	'generatedOn' in field.options

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

const validateUpdateExpression = (
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

const assertSchemaDefinition = (value: unknown): SchemaDefinition => {
	if (!Schema.is(value)) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Operation schema is not a schema definition.',
			{ publicMessage: 'The operation is invalid.' },
		)
	}
	return value
}

/** Raises one consistent transport-neutral error for structural and behavior issues. */
export const throwRuntimeValidationIssues = (
	issues: readonly RuntimeValidationIssue[],
	description: Readonly<RuntimeValidationErrorDescription> = {
		internalMessage: 'Operation input validation failed.',
		publicMessage: 'The operation input is invalid.',
	},
): never => {
	const immutableIssues = immutableArray(issues)

	throw new FrameworkError('VALIDATION_ERROR', description.internalMessage, {
		publicMessage: description.publicMessage,
		publicDetails: { issues: immutableIssues },
		internalDetails: { issues: immutableIssues },
	})
}

interface MutationNormalizationOptions {
	readonly allowDefaults: boolean
	readonly appendGeneratedValues: boolean
	readonly createPlan: SchemaValidationPlan
	readonly previousOperation?: DatabaseOperationAst
	readonly updatePlan: SchemaValidationPlan
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
const validateUpsertCreateInput = (
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

const normalizeMutationOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	execution: ValidationExecution,
	options: MutationNormalizationOptions,
): TOperation => {
	const untrustedOperation = operation as unknown as Readonly<
		Record<string, unknown>
	>
	const previousOperation: Readonly<Record<string, unknown>> | undefined =
		isPlainRecord(options.previousOperation)
			? options.previousOperation
			: undefined
	let normalized: Readonly<Record<string, unknown>> = untrustedOperation

	switch (untrustedOperation.kind) {
		case 'create-one': {
			const input = validateSchemaInput(
				options.createPlan,
				untrustedOperation.input,
				['input'],
				execution,
				options.allowDefaults,
			)

			if (input !== undefined) {
				normalized = immutableRecord({ ...untrustedOperation, input })
			}
			break
		}
		case 'create-many': {
			if (!isUnknownArray(untrustedOperation.inputs)) {
				appendIssue(
					execution,
					'array.type',
					['inputs'],
					'Create inputs must be an array',
				)
				break
			}

			const inputs = untrustedOperation.inputs.map((input, index) =>
				validateSchemaInput(
					options.createPlan,
					input,
					['inputs', index],
					execution,
					options.allowDefaults,
				),
			)

			normalized = immutableRecord({
				...untrustedOperation,
				inputs: immutableArray(inputs),
			})
			break
		}
		case 'update-one':
		case 'update-many': {
			const update = validateUpdateExpression(
				options.updatePlan,
				untrustedOperation.update,
				['update'],
				execution,
				options.appendGeneratedValues,
				previousOperation?.update,
			)

			if (update !== undefined) {
				normalized = immutableRecord({ ...untrustedOperation, update })
			}
			break
		}
		case 'upsert-one': {
			const create = validateUpsertCreateInput(
				untrustedOperation.create,
				untrustedOperation.query,
				untrustedOperation.target,
				['create'],
				execution,
				options.createPlan,
				options.allowDefaults,
			)
			const update = validateUpdateExpression(
				options.updatePlan,
				untrustedOperation.update,
				['update'],
				execution,
				options.appendGeneratedValues,
				previousOperation?.update,
			)

			if (create !== undefined && update !== undefined) {
				normalized = immutableRecord({ ...untrustedOperation, create, update })
			}
			break
		}
		case 'upsert-many': {
			if (!isUnknownArray(untrustedOperation.items)) {
				appendIssue(
					execution,
					'array.type',
					['items'],
					'Upsert items must be an array',
				)
				break
			}

			const previousItems = isUnknownArray(previousOperation?.items)
				? previousOperation.items
				: []
			const items = untrustedOperation.items.map((item, index) => {
				if (!isPlainRecord(item)) {
					appendIssue(
						execution,
						'object.type',
						['items', index],
						'Upsert item must be a plain object',
					)

					return item
				}

				const create = validateUpsertCreateInput(
					item.create,
					item.query,
					item.target,
					['items', index, 'create'],
					execution,
					options.createPlan,
					options.allowDefaults,
				)
				const update = validateUpdateExpression(
					options.updatePlan,
					item.update,
					['items', index, 'update'],
					execution,
					options.appendGeneratedValues,
					isPlainRecord(previousItems[index])
						? previousItems[index].update
						: undefined,
				)

				return create === undefined || update === undefined
					? item
					: immutableRecord({ ...item, create, update })
			})

			normalized = immutableRecord({
				...untrustedOperation,
				items: immutableArray(items),
			})
			break
		}
	}

	if (execution.issues.length > 0) {
		throwRuntimeValidationIssues(execution.issues)
	}
	// Every operation discriminant and schema identity is preserved by reconstruction.
	return normalized as unknown as TOperation
}

const snapshotOutputFieldPlan = (
	plan: FieldValidationPlan,
	isProperty: boolean,
): FieldValidationPlan => {
	const presence = isProperty
		? isRequiredOutput(plan.field)
			? ('required' as const)
			: ('optional' as const)
		: plan.presence

	switch (plan.kind) {
		case 'array':
			return immutableRecord({
				...plan,
				presence,
				items: snapshotOutputFieldPlan(plan.items, false),
			})
		case 'object':
			return immutableRecord({
				...plan,
				presence,
				fields: immutableRecord(
					Object.fromEntries(
						Object.entries(plan.fields).map(([name, child]) => [
							name,
							snapshotOutputFieldPlan(child, true),
						]),
					),
				),
			})
		case 'scalar':
			return immutableRecord({ ...plan, presence })
	}
}

const createOutputValidationPlan = (
	plan: SchemaValidationPlan,
	selectedFields?: readonly string[],
): SchemaValidationPlan => {
	const selected =
		selectedFields === undefined ? undefined : new Set(selectedFields)
	const entries: [string, FieldValidationPlan][] = []

	for (const [name, fieldPlan] of Object.entries(plan.fields)) {
		if (selected === undefined || selected.has(name)) {
			entries.push([name, snapshotOutputFieldPlan(fieldPlan, true)])
		}
	}

	return immutableRecord({
		...plan,
		fields: immutableRecord(Object.fromEntries(entries)),
	})
}

const unavailableGeneratedValue = (): never => {
	throw new TypeError('Structural revalidation cannot generate field values')
}

const createStructuralValidationExecution = (): ValidationExecution => ({
	issues: [],
	// These values are deliberately unusable: structural boundaries never resolve omissions.
	temporal: immutableRecord({
		date: '',
		dateTime: '',
		dateTimeWithTimezone: '',
		time: '',
		timeWithTimezone: '',
	}),
	timestamp: Number.NaN,
	uuidV7Generator: unavailableGeneratedValue,
})

const normalizeResolvedMutationOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	previousOperation: TOperation,
	operation: TOperation,
	plans: SchemaValidationPlans,
	execution: ValidationExecution,
): TOperation => {
	return normalizeMutationOperation(operation, execution, {
		allowDefaults: false,
		appendGeneratedValues: false,
		createPlan: createOutputValidationPlan(plans.create),
		previousOperation,
		updatePlan: plans.update,
	})
}

/** Structurally snapshots one intermediate behavior replacement. */
export const snapshotRuntimeMutationOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	previousOperation: TOperation,
	operation: TOperation,
	plans: SchemaValidationPlans,
): TOperation =>
	normalizeResolvedMutationOperation(
		previousOperation,
		operation,
		plans,
		createStructuralValidationExecution(),
	)

/** Revalidates one final mutation without replaying defaults or generators. */
export const revalidateRuntimeMutationOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	previousOperation: TOperation,
	operation: TOperation,
	plans: SchemaValidationPlans,
): TOperation =>
	normalizeResolvedMutationOperation(
		previousOperation,
		operation,
		plans,
		createStructuralValidationExecution(),
	)

/** Validates and snapshots one complete or selected logical database record. */
export const snapshotRuntimeResultRecord = (
	plans: SchemaValidationPlans,
	value: unknown,
	path: ValidationIssuePath,
	selectedFields?: readonly string[],
	description?: Readonly<RuntimeValidationErrorDescription>,
): Readonly<Record<string, unknown>> => {
	const execution = createStructuralValidationExecution()
	const result = validateSchemaInput(
		createOutputValidationPlan(plans.create, selectedFields),
		value,
		path,
		execution,
		false,
	)

	if (execution.issues.length > 0) {
		throwRuntimeValidationIssues(execution.issues, description)
	}

	if (result === undefined) {
		// The validator always records at least one issue when it cannot produce a record.
		throw new FrameworkError('VALIDATION_ERROR', 'Result validation failed.', {
			publicMessage: 'The operation result is invalid.',
		})
	}

	return result
}

/** Creates initial Core structural validation without application field validators. */
export const createRuntimeValidationStage = (
	options: RuntimeValidationOptions = emptyRuntimeValidationOptions,
): RuntimeOperationTransformStage => {
	const normalizedOptions = normalizeRuntimeValidationOptions(options)
	const timezone = normalizedOptions.timezone ?? 'UTC'

	const formatter = createApplicationTimezoneFormatter(timezone)
	const clock = normalizedOptions.clock ?? (() => new Date())
	const uuidV7Generator = normalizedOptions.uuidV7Generator ?? generateUuidV7
	const plansBySchema = new WeakMap<object, SchemaValidationPlans>()

	return <const TOperation extends DatabaseOperationAst>(
		input: Readonly<{ readonly operation: TOperation }>,
	): TOperation => {
		const { operation } = input

		if (!mutationKinds.has(operation.kind)) {
			return operation
		}

		const schema = assertSchemaDefinition(getOperationSchema(operation))
		let plans = plansBySchema.get(schema)

		if (plans === undefined) {
			plans = compileValidationPlans(schema)
			plansBySchema.set(schema, plans)
		}

		const instant = clock()
		const execution: ValidationExecution = {
			issues: [],
			temporal: projectOperationTemporalValues(instant, formatter),
			timestamp: instant.getTime(),
			uuidV7Generator,
		}

		return normalizeMutationOperation(operation, execution, {
			allowDefaults: true,
			appendGeneratedValues: true,
			createPlan: plans.create,
			updatePlan: plans.update,
		})
	}
}

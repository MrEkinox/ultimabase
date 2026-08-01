import type { OperationKind, UpdateExpressionNode } from '@ultimabase/query'
import {
	compileValidationPlans,
	fieldUsesTemporalTimezone,
	snapshotScalarFieldValue,
	validateScalarFieldConstraints,
	type AnyValidationIssueCode,
	type FieldValidationPlan,
	type GenericField,
	type SchemaDefinition,
	type SchemaValidationPlan,
	type SchemaValidationPlans,
	type ValidationIssue,
	type ValidationIssuePath,
} from '@ultimabase/schema'
import { FrameworkError } from '@ultimabase/core'
import {
	assertNonEmptyString,
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

/** Configures one application-scoped validation stage and operation clock. */
export interface RuntimeValidationOptions {
	readonly clock?: () => Date
	readonly timezone?: string
}

interface ValidationExecution {
	readonly issues: ValidationIssue<AnyValidationIssueCode>[]
	readonly temporal: OperationTemporalValues
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

const mutationKinds = new Set<OperationKind>([
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
])
const updateKinds = new Set(['decrement', 'increment', 'set', 'unset'])
const validationOptionKeys = new Set(['clock', 'timezone'])
const emptyValidationOptions: RuntimeValidationOptions = immutableRecord({})

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
			execution.issues.push(
				...validateScalarFieldConstraints(field, snapshot, path),
			)
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
	temporal: OperationTemporalValues,
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
		return { found: true, value: temporal.dateTimeWithTimezone }
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
					true,
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
			? resolveMissingValue(plan.field, execution.temporal)
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
	('validation' in field.options &&
		isPlainRecord(field.options.validation) &&
		field.options.validation.required === true) ||
	'default' in field.options ||
	('autoNow' in field.options && field.options.autoNow === true) ||
	('autoIncrement' in field.options && field.options.autoIncrement === true) ||
	'generatedOn' in field.options

const validateUpdateExpression = (
	plan: SchemaValidationPlan,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
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

	for (const [index, candidate] of value.operations.entries()) {
		const operationPath: ValidationIssuePath = [...path, index]

		if (
			!isPlainRecord(candidate) ||
			typeof candidate.kind !== 'string' ||
			!updateKinds.has(candidate.kind) ||
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

		if (fieldPlan.presence === 'forbidden') {
			appendIssue(
				execution,
				'field.forbidden',
				fieldPath,
				'Update field is immutable or generated',
			)
			continue
		}

		if (candidate.kind === 'unset') {
			if (isRequiredOutput(fieldPlan.field)) {
				appendIssue(
					execution,
					'field.required',
					fieldPath,
					'Required output field cannot be unset',
				)
				continue
			}

			operations.push(immutableRecord(candidate))
			continue
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

	const updatedAtPlan = plan.fields.updatedAt

	if (
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
	if (
		!isPlainRecord(value) ||
		typeof value.className !== 'string' ||
		!isPlainRecord(value.fields)
	) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Operation schema is not a schema definition.',
			{ publicMessage: 'The operation is invalid.' },
		)
	}

	return value as unknown as SchemaDefinition
}

const throwValidationIssues = (
	issues: readonly ValidationIssue<AnyValidationIssueCode>[],
): never => {
	const immutableIssues = immutableArray(issues)

	throw new FrameworkError(
		'VALIDATION_ERROR',
		'Operation input validation failed.',
		{
			publicMessage: 'The operation input is invalid.',
			publicDetails: { issues: immutableIssues },
			internalDetails: { issues: immutableIssues },
		},
	)
}

const normalizeMutationOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	plans: SchemaValidationPlans,
	execution: ValidationExecution,
): TOperation => {
	const untrustedOperation = operation as unknown as Readonly<
		Record<string, unknown>
	>
	let normalized: Readonly<Record<string, unknown>> = untrustedOperation

	switch (untrustedOperation.kind) {
		case 'create-one': {
			const input = validateSchemaInput(
				plans.create,
				untrustedOperation.input,
				['input'],
				execution,
				true,
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
					plans.create,
					input,
					['inputs', index],
					execution,
					true,
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
				plans.update,
				untrustedOperation.update,
				['update'],
				execution,
			)

			if (update !== undefined) {
				normalized = immutableRecord({ ...untrustedOperation, update })
			}
			break
		}
		case 'upsert-one': {
			const create = validateSchemaInput(
				plans.create,
				untrustedOperation.create,
				['create'],
				execution,
				true,
			)
			const update = validateUpdateExpression(
				plans.update,
				untrustedOperation.update,
				['update'],
				execution,
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

				const create = validateSchemaInput(
					plans.create,
					item.create,
					['items', index, 'create'],
					execution,
					true,
				)
				const update = validateUpdateExpression(
					plans.update,
					item.update,
					['items', index, 'update'],
					execution,
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
		throwValidationIssues(execution.issues)
	}

	// Every operation discriminant and schema identity is preserved by reconstruction.
	return normalized as unknown as TOperation
}

/** Creates the structural validation stage shared by every transport and access mode. */
export const createRuntimeValidationStage = (
	options: RuntimeValidationOptions = emptyValidationOptions,
): RuntimeOperationTransformStage => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('Runtime validation options must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (!validationOptionKeys.has(key)) {
			throw new TypeError(`Runtime validation contains unknown option: ${key}`)
		}
	}

	if (options.clock !== undefined && typeof options.clock !== 'function') {
		throw new TypeError('Runtime validation clock must be a function')
	}

	const timezone = options.timezone ?? 'UTC'
	assertNonEmptyString(timezone, 'Runtime validation timezone')

	const formatter = createApplicationTimezoneFormatter(timezone)
	const clock = options.clock ?? (() => new Date())
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

		const execution: ValidationExecution = {
			issues: [],
			temporal: projectOperationTemporalValues(clock(), formatter),
		}

		return normalizeMutationOperation(operation, plans, execution)
	}
}

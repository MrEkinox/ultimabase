import {
	applyUpdateExpressionToRecord,
	collectOperationFieldInputs,
	compileValidationPlans,
	FrameworkError,
	getOperationSchema,
	readRuntimeFieldValuePath,
	Schema,
	snapshotRuntimeResultRecord,
	type ApplicationCallbackExecutor,
	type DatabaseMutationOperationAst,
	type GenericField,
	type RuntimePreparedMutationStageInput,
	type SchemaValidationPlans,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	type FieldValidationIssue,
	validateFieldStandardSchema,
} from './field-validation.js'
import type { FieldStandardSchema } from './standard-schema.js'

interface ArithmeticFieldOccurrence {
	readonly field: string
	readonly path: readonly (number | string)[]
	readonly validator: FieldStandardSchema
}

const readValidator = (
	field: GenericField,
): FieldStandardSchema | undefined => {
	const value: unknown = Reflect.get(field.options, 'validation')
	return value === undefined ? undefined : (value as FieldStandardSchema)
}

const isArithmeticInput = (
	operation: DatabaseMutationOperationAst,
	path: readonly (number | string)[],
): boolean => {
	const parent = readRuntimeFieldValuePath(operation, path.slice(0, -1))
	return (
		parent.found &&
		isPlainRecord(parent.value) &&
		(parent.value.kind === 'increment' || parent.value.kind === 'decrement')
	)
}

const pathContainsFailure = (
	path: readonly (number | string)[],
	failedPaths: readonly (readonly (number | string)[])[],
): boolean =>
	failedPaths.some(
		(failedPath) =>
			failedPath.length > path.length &&
			path.every((segment, index) => failedPath[index] === segment),
	)

const collectDirectIssues = (
	operation: DatabaseMutationOperationAst,
	callbacks: ApplicationCallbackExecutor,
): readonly FieldValidationIssue[] => {
	const issues: FieldValidationIssue[] = []
	const failedPaths: (readonly (number | string)[])[] = []

	for (const input of collectOperationFieldInputs(
		operation,
		'children-first',
	)) {
		const validator = readValidator(input.field)
		if (
			validator === undefined ||
			input.value === null ||
			isArithmeticInput(operation, input.valuePath) ||
			pathContainsFailure(input.valuePath, failedPaths)
		) {
			continue
		}

		const fieldIssues = callbacks.runApplication(() =>
			validateFieldStandardSchema(validator, input.value, input.valuePath),
		)
		issues.push(...fieldIssues)
		if (fieldIssues.length > 0) failedPaths.push(input.valuePath)
	}

	return immutableArray(issues)
}

const readArithmeticFields = (
	update: unknown,
	fields: Readonly<Record<string, GenericField>>,
	path: readonly (number | string)[],
): readonly ArithmeticFieldOccurrence[] => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return immutableArray([])
	}

	const occurrences = new Map<string, ArithmeticFieldOccurrence>()
	for (const [index, operation] of update.operations.entries()) {
		if (
			!isPlainRecord(operation) ||
			(operation.kind !== 'increment' && operation.kind !== 'decrement') ||
			typeof operation.field !== 'string'
		) {
			continue
		}

		const field = fields[operation.field]
		const validator = field === undefined ? undefined : readValidator(field)
		if (validator !== undefined) {
			occurrences.set(
				operation.field,
				immutableRecord({
					field: operation.field,
					path: immutableArray([...path, index, operation.field, 'value']),
					validator,
				}),
			)
		}
	}

	return immutableArray([...occurrences.values()])
}

const createProjectableUpdate = (update: unknown): UpdateExpressionNode => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		throw new TypeError('Projected arithmetic requires a normalized update')
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(
			update.operations.filter(
				(operation) =>
					isPlainRecord(operation) &&
					(operation.kind === 'set' ||
						operation.kind === 'increment' ||
						operation.kind === 'decrement'),
			),
		),
	})
}

const unavailableTargetIssues = (
	fields: readonly ArithmeticFieldOccurrence[],
	message: string,
): readonly FieldValidationIssue[] =>
	immutableArray(
		fields.map(({ path }) =>
			immutableRecord({ code: 'field.validation' as const, message, path }),
		),
	)

const validateTargetProjection = (
	operation: DatabaseMutationOperationAst,
	plans: SchemaValidationPlans,
	update: unknown,
	fields: readonly ArithmeticFieldOccurrence[],
	target: Readonly<Record<string, unknown>>,
	targetPath: readonly (number | string)[],
	callbacks: ApplicationCallbackExecutor,
): readonly FieldValidationIssue[] => {
	const schema = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Projected arithmetic requires a schema definition')
	}

	const stableTarget = snapshotRuntimeResultRecord(plans, target, targetPath)
	const projection = applyUpdateExpressionToRecord(
		schema,
		stableTarget,
		createProjectableUpdate(update),
	)
	const stableProjection = snapshotRuntimeResultRecord(
		plans,
		projection,
		targetPath,
	)
	const issues: FieldValidationIssue[] = []

	for (const { field, path, validator } of fields) {
		const value: unknown = stableProjection[field]
		if (value !== undefined && value !== null) {
			issues.push(
				...callbacks.runApplication(() =>
					validateFieldStandardSchema(validator, value, path),
				),
			)
		}
	}

	return immutableArray(issues)
}

const collectArithmeticIssues = (
	input: RuntimePreparedMutationStageInput<DatabaseMutationOperationAst>,
	plans: SchemaValidationPlans,
	callbacks: ApplicationCallbackExecutor,
): readonly FieldValidationIssue[] => {
	const operation: unknown = input.operation
	if (!isPlainRecord(operation)) return immutableArray([])
	const schema = getOperationSchema(input.operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Projected arithmetic requires a schema definition')
	}

	const validate = (
		kind: 'update-many' | 'update-one' | 'upsert-one',
		update: unknown,
		path: readonly (number | string)[],
	): readonly FieldValidationIssue[] => {
		const fields = readArithmeticFields(update, schema.fields, path)
		if (
			fields.length === 0 ||
			(kind === 'update-one' && input.target === null)
		) {
			return immutableArray([])
		}
		if (kind === 'update-many') {
			if (input.targets === undefined) {
				return unavailableTargetIssues(
					fields,
					'Validated bulk arithmetic requires complete prepared targets',
				)
			}
			return immutableArray(
				input.targets.flatMap((target, index) =>
					validateTargetProjection(
						input.operation,
						plans,
						update,
						fields,
						target,
						['targets', index],
						callbacks,
					),
				),
			)
		}
		if (kind === 'upsert-one' && input.target === null) {
			return unavailableTargetIssues(
				fields,
				'Targetless upsert arithmetic cannot validate a concurrent update result',
			)
		}
		if (input.target === undefined || input.target === null) {
			throw new TypeError(
				'Directed arithmetic validation requires a prepared target',
			)
		}
		return validateTargetProjection(
			input.operation,
			plans,
			update,
			fields,
			input.target,
			['target'],
			callbacks,
		)
	}

	switch (operation.kind) {
		case 'update-one':
		case 'update-many':
			return validate(operation.kind, operation.update, ['update'])
		case 'upsert-one':
			return validate(operation.kind, operation.update, ['update'])
		case 'upsert-many': {
			const fields = isUnknownArray(operation.items)
				? operation.items.flatMap((item, index) =>
						isPlainRecord(item)
							? readArithmeticFields(item.update, schema.fields, [
									'items',
									index,
									'update',
								])
							: [],
					)
				: []
			return fields.length === 0
				? immutableArray([])
				: unavailableTargetIssues(
						fields,
						'Validated bulk upsert arithmetic requires per-item prepared targets',
					)
		}
		default:
			return immutableArray([])
	}
}

const throwValidationIssues = (
	issues: readonly FieldValidationIssue[],
): never => {
	const snapshot = immutableArray(issues)
	throw new FrameworkError(
		'VALIDATION_ERROR',
		'Operation input validation failed.',
		{
			publicMessage: 'The operation input is invalid.',
			publicDetails: { issues: snapshot },
			internalDetails: { issues: snapshot },
		},
	)
}

/** Validates every installed field rule against one final mutation candidate. */
export const validateMutationInput = (
	input: RuntimePreparedMutationStageInput<DatabaseMutationOperationAst>,
	plans: SchemaValidationPlans,
	callbacks: ApplicationCallbackExecutor,
): void => {
	const issues = [
		...collectDirectIssues(input.operation, callbacks),
		...collectArithmeticIssues(input, plans, callbacks),
	]
	if (issues.length > 0) throwValidationIssues(issues)
}

/** Requests bulk preimages only for affected arithmetic fields with validators. */
export const requiresValidationTargets = (
	operation: DatabaseMutationOperationAst,
): boolean => {
	if (operation.kind !== 'update-many') return false
	const schema = getOperationSchema(operation)
	if (!Schema.is(schema)) return false
	const candidate: unknown = operation
	return (
		isPlainRecord(candidate) &&
		readArithmeticFields(candidate.update, schema.fields, ['update']).length > 0
	)
}

/** Compiles reusable Core structural plans without retaining global application state. */
export const createValidationPlanCache = () => {
	const plansBySchema = new WeakMap<object, SchemaValidationPlans>()
	return (operation: DatabaseMutationOperationAst): SchemaValidationPlans => {
		const schema = getOperationSchema(operation)
		if (!Schema.is(schema)) {
			throw new TypeError('Field validation requires a schema definition')
		}
		let plans = plansBySchema.get(schema)
		if (plans === undefined) {
			plans = compileValidationPlans(schema)
			plansBySchema.set(schema, plans)
		}
		return plans
	}
}

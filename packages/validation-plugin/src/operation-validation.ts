import {
	applyUpdateExpressionToRecord,
	compileValidationPlans,
	getOperationSchema,
	isRelationUpdateExpression,
	readRuntimeFieldValuePath,
	Schema,
	snapshotRuntimeResultRecord,
	transformOperationFieldInputs,
	type DatabaseMutationOperationAst,
	type GenericField,
	type RuntimeFieldInputValue,
	type RuntimeMutationValidationResult,
	type RuntimeMutationValidationStageInput,
	type SchemaDefinition,
	type SchemaValidationPlans,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import type { ApplicationCallbackExecutor } from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { runFieldValidator, type ValidationIssue } from './field-validation.js'
import { runSchemaValidation } from './schema-validation.js'

type Path = readonly (number | string)[]

/** Reads a field's validator; the option normalizer is its only writer. */
export const readFieldValidator = (field: GenericField): unknown =>
	Reflect.get(field.options, 'validation')

/** Reads a schema's `validation` rule; the option normalizer is its only writer. */
export const readSchemaValidation = (schema: SchemaDefinition): unknown =>
	Object.hasOwn(schema.definition, 'validation')
		? Reflect.get(schema.definition, 'validation')
		: undefined

/** Whether one path contains the other: issues under either are related. */
const related = (left: Path, right: Path): boolean => {
	const length = Math.min(left.length, right.length)
	for (let index = 0; index < length; index += 1) {
		if (left[index] !== right[index]) return false
	}
	return true
}

/**
 * Names an update value as Core's structural issues do:
 * `['update', <operation>, <field>, 'value', …]` (ADR-0319).
 */
const issuePathOf = (input: RuntimeFieldInputValue): Path => {
	const path = input.valuePath
	const at = path.indexOf('operations')
	const index = path[at + 1]
	return input.mode === 'update' &&
		at >= 0 &&
		typeof index === 'number' &&
		path[at + 2] === 'value'
		? immutableArray([
				...path.slice(0, at),
				index,
				input.fieldPath[0] ?? '',
				...path.slice(at + 2),
			])
		: path
}

const isArithmeticInput = (
	operation: DatabaseMutationOperationAst,
	path: Path,
): boolean => {
	const parent = readRuntimeFieldValuePath(operation, path.slice(0, -1))
	return (
		parent.found &&
		isPlainRecord(parent.value) &&
		(parent.value.kind === 'increment' || parent.value.kind === 'decrement')
	)
}

/**
 * Runs every field validator over present non-null values, children first,
 * and stores their outputs (ADR-0319). A failed child skips its parent; a
 * value under a structural issue is not validated.
 */
const validateFields = async (
	operation: DatabaseMutationOperationAst,
	structuralIssues: readonly Readonly<{ path: Path }>[],
	callbacks: ApplicationCallbackExecutor,
): Promise<
	Readonly<{
		issues: readonly ValidationIssue[]
		operation: DatabaseMutationOperationAst
	}>
> => {
	const issues: ValidationIssue[] = []
	const failed: Path[] = []
	const transformed = await transformOperationFieldInputs(
		operation,
		async (input) => {
			const validator = readFieldValidator(input.field)
			const path = issuePathOf(input)
			if (
				validator === undefined ||
				input.value === null ||
				isArithmeticInput(operation, input.valuePath) ||
				failed.some((failure) => related(failure, input.valuePath)) ||
				structuralIssues.some((issue) => related(issue.path, path))
			) {
				return undefined
			}
			const outcome = await callbacks.runApplication(() =>
				runFieldValidator(validator, input.value, path),
			)
			if (outcome.issues.length > 0) {
				issues.push(...outcome.issues)
				failed.push(input.valuePath)
				return undefined
			}
			return outcome.value === input.value ? undefined : outcome.value
		},
	)
	return { issues, operation: transformed }
}

interface ArithmeticField {
	readonly field: string
	readonly path: Path
	readonly validator: unknown
}

const readArithmeticFields = (
	update: unknown,
	fields: Readonly<Record<string, GenericField>>,
	path: Path,
): readonly ArithmeticField[] => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) return []
	const occurrences = new Map<string, ArithmeticField>()
	for (const [index, operation] of update.operations.entries()) {
		if (
			!isPlainRecord(operation) ||
			(operation.kind !== 'increment' && operation.kind !== 'decrement') ||
			typeof operation.field !== 'string'
		) {
			continue
		}
		const field = fields[operation.field]
		const validator = field === undefined ? undefined : readFieldValidator(field)
		if (validator !== undefined) {
			occurrences.set(operation.field, {
				field: operation.field,
				path: immutableArray([...path, index, operation.field, 'value']),
				validator,
			})
		}
	}
	return [...occurrences.values()]
}

/** Keeps the scalar part of an update to project its arithmetic results. */
const projectableUpdate = (update: unknown): UpdateExpressionNode =>
	immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(
			(isPlainRecord(update) && isUnknownArray(update.operations)
				? update.operations
				: []
			).filter(
				(operation) =>
					isPlainRecord(operation) &&
					(operation.kind === 'set' ||
						operation.kind === 'increment' ||
						operation.kind === 'decrement'),
			),
		),
	})

const unavailableTarget = (
	fields: readonly ArithmeticField[],
	message: string,
): readonly ValidationIssue[] =>
	fields.map(({ path }) =>
		immutableRecord({ code: 'field.validation', message, path }),
	)

/**
 * Validates the complete value an atomic `{ increment }` produces, from the
 * prepared target; the delta stays atomic and an output is not stored.
 */
const validateArithmetic = async (
	input: RuntimeMutationValidationStageInput<DatabaseMutationOperationAst>,
	schema: SchemaDefinition,
	plans: SchemaValidationPlans,
	callbacks: ApplicationCallbackExecutor,
): Promise<readonly ValidationIssue[]> => {
	const operation: unknown = input.operation
	if (!isPlainRecord(operation)) return []
	if (operation.kind === 'upsert-many') {
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
		return unavailableTarget(
			fields,
			'Validated bulk upsert arithmetic requires per-item prepared targets',
		)
	}
	if (
		operation.kind !== 'update-one' &&
		operation.kind !== 'update-many' &&
		operation.kind !== 'upsert-one'
	) {
		return []
	}
	const fields = readArithmeticFields(operation.update, schema.fields, [
		'update',
	])
	if (
		fields.length === 0 ||
		(operation.kind === 'update-one' && input.target === null)
	) {
		return []
	}
	const update = projectableUpdate(operation.update)
	const validateTarget = async (
		target: Readonly<Record<string, unknown>>,
		targetPath: Path,
	): Promise<readonly ValidationIssue[]> => {
		const projection = snapshotRuntimeResultRecord(
			plans,
			applyUpdateExpressionToRecord(
				schema,
				snapshotRuntimeResultRecord(plans, target, targetPath),
				update,
			),
			targetPath,
		)
		const issues: ValidationIssue[] = []
		for (const { field, path, validator } of fields) {
			const value: unknown = projection[field]
			if (value === undefined || value === null) continue
			const outcome = await callbacks.runApplication(() =>
				runFieldValidator(validator, value, path),
			)
			issues.push(...outcome.issues)
		}
		return issues
	}

	if (operation.kind === 'update-many') {
		if (input.targets === undefined) {
			return unavailableTarget(
				fields,
				'Validated bulk arithmetic requires complete prepared targets',
			)
		}
		const issues: ValidationIssue[] = []
		for (const [index, target] of input.targets.entries()) {
			issues.push(...(await validateTarget(target, ['targets', index])))
		}
		return issues
	}
	if (operation.kind === 'upsert-one' && input.target === null) {
		return unavailableTarget(
			fields,
			'Targetless upsert arithmetic cannot validate a concurrent update result',
		)
	}
	if (input.target === undefined || input.target === null) {
		throw new TypeError(
			'Directed arithmetic validation requires a prepared target',
		)
	}
	return validateTarget(input.target, ['target'])
}

/** Builds the complete item(s) a mutation would store, for schema checks. */
const readCandidateItems = (
	schema: SchemaDefinition,
	operation: unknown,
	target: Readonly<Record<string, unknown>> | null | undefined,
	targets: readonly Readonly<Record<string, unknown>>[] | undefined,
): readonly Readonly<{ item: Readonly<Record<string, unknown>>; prefix: Path }>[] => {
	if (!isPlainRecord(operation)) return []
	const applyTo = (current: Readonly<Record<string, unknown>>) =>
		isRelationUpdateExpression(operation.update) ||
		!isPlainRecord(operation.update)
			? current
			: applyUpdateExpressionToRecord(
					schema,
					current,
					operation.update as unknown as UpdateExpressionNode,
				)
	switch (operation.kind) {
		case 'create-one':
			return isPlainRecord(operation.input)
				? [{ item: operation.input, prefix: [] }]
				: []
		case 'create-many':
			return isUnknownArray(operation.inputs)
				? operation.inputs.flatMap((input, index) =>
						isPlainRecord(input) ? [{ item: input, prefix: [index] }] : [],
					)
				: []
		case 'update-one':
			return target === null || target === undefined
				? []
				: [{ item: applyTo(target), prefix: [] }]
		case 'update-many':
			return (targets ?? []).map((current, index) => ({
				item: applyTo(current),
				prefix: [index],
			}))
		case 'upsert-one':
			if (target === null || target === undefined) {
				return isPlainRecord(operation.create)
					? [{ item: operation.create, prefix: [] }]
					: []
			}
			return [{ item: applyTo(target), prefix: [] }]
		default:
			return []
	}
}

/**
 * Validates one mutation candidate (ADR-0319): field validators on present
 * values (only the changed fields of an update), projected arithmetic, then
 * the schema check on each complete item. Values under Core's structural
 * issues are skipped; schema checks need a structurally valid candidate.
 */
export const validateMutationInput = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimeMutationValidationStageInput<TOperation>,
	plans: SchemaValidationPlans,
	callbacks: ApplicationCallbackExecutor,
): Promise<RuntimeMutationValidationResult<TOperation>> => {
	const schema = getOperationSchema(input.operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Field validation requires a schema definition')
	}
	const structural = input.structuralIssues.length > 0
	let fields: Awaited<ReturnType<typeof validateFields>>
	try {
		fields = await validateFields(
			input.operation,
			input.structuralIssues,
			callbacks,
		)
	} catch (error: unknown) {
		// A structurally invalid candidate may not even be traversable.
		if (!structural) throw error
		return { issues: immutableArray([]), operation: input.operation }
	}
	if (structural) {
		return { issues: immutableArray(fields.issues), operation: input.operation }
	}
	// The traversal rebuilds the same operation kind with replaced values only.
	const operation = fields.operation as TOperation
	const issues: ValidationIssue[] = [
		...fields.issues,
		...(await validateArithmetic(input, schema, plans, callbacks)),
	]
	const validation = readSchemaValidation(schema)
	if (validation !== undefined) {
		for (const { item, prefix } of readCandidateItems(
			schema,
			operation,
			input.target,
			input.targets,
		)) {
			issues.push(
				...(await callbacks.runApplication(() =>
					runSchemaValidation(validation, item, prefix),
				)),
			)
		}
	}
	return { issues: immutableArray(issues), operation }
}

/** Requests bulk preimages for projected arithmetic and schema checks. */
export const requiresValidationTargets = (
	operation: DatabaseMutationOperationAst,
): boolean => {
	if (operation.kind !== 'update-many') return false
	const schema = getOperationSchema(operation)
	if (!Schema.is(schema)) return false
	const candidate: unknown = operation
	return (
		readSchemaValidation(schema) !== undefined ||
		(isPlainRecord(candidate) &&
			readArithmeticFields(candidate.update, schema.fields, ['update'])
				.length > 0)
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

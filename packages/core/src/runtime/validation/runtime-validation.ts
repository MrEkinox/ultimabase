import {
	compileValidationPlans,
	Schema,
	type FieldValidationPlan,
	type SchemaDefinition,
	type SchemaValidationPlan,
	type SchemaValidationPlans,
	type ValidationIssuePath,
} from '../../schema/index.js'
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
} from './operation-clock.js'
import { generateUuidV7 } from './identifier-generator.js'
import { readReservedCreateId } from '../nested-writes/reserved-create.js'
import { mutationKinds } from './operation-kinds.js'
import {
	emptyRuntimeValidationOptions,
	normalizeRuntimeValidationOptions,
	type RuntimeValidationOptions,
} from './runtime-validation-options.js'

import {
	isRequiredOutput,
	validateSchemaInput,
	type ValidationExecution,
} from './runtime-field-validation.js'
import { validateUpdateExpression } from './runtime-update-validation.js'
import { validateUpsertCreateInput } from './runtime-upsert-validation.js'
import {
	appendIssue,
	throwRuntimeValidationIssues,
	type RuntimeValidationErrorDescription,
} from './runtime-validation-errors.js'
export {
	throwRuntimeValidationIssues,
	type RuntimeValidationErrorDescription,
	type RuntimeValidationIssue,
} from './runtime-validation-errors.js'

export {
	normalizeRuntimeValidationOptions,
	type RuntimeValidationOptions,
} from './runtime-validation-options.js'

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

interface MutationNormalizationOptions {
	readonly allowDefaults: boolean
	readonly appendGeneratedValues: boolean
	readonly createPlan: SchemaValidationPlan
	readonly previousOperation?: DatabaseOperationAst
	readonly updatePlan: SchemaValidationPlan
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
			const reservedId = readReservedCreateId(operation)
			const input = validateSchemaInput(
				options.createPlan,
				untrustedOperation.input,
				['input'],
				execution,
				options.allowDefaults,
				reservedId === undefined
					? undefined
					: immutableRecord({ id: reservedId }),
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

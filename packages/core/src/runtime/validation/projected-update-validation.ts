import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { applyUpdateExpressionToRecord } from '../../query/updates/apply.js'
import type {
	AnyValidationIssueCode,
	SchemaDefinition,
	SchemaValidationPlan,
	SchemaValidationPlans,
	ValidationIssue,
} from '../../schema/index.js'
import {
	throwRuntimeValidationIssues,
	validateFieldValue,
} from './runtime-field-validation.js'
import {
	createOutputValidationPlan,
	createStructuralValidationExecution,
} from './runtime-validation.js'

type LogicalRecord = Readonly<Record<string, unknown>>

interface ProjectedOperation {
	readonly field: string
	readonly index: number
}

const outputPlans = new WeakMap<SchemaValidationPlans, SchemaValidationPlan>()

/** Compiles the complete stored-value plan of one schema once. */
const readOutputPlan = (plans: SchemaValidationPlans): SchemaValidationPlan => {
	let plan = outputPlans.get(plans)
	if (plan === undefined) {
		plan = createOutputValidationPlan(plans.create)
		outputPlans.set(plans, plan)
	}
	return plan
}

/**
 * Lists the operations whose stored result the database computes from the
 * current value: numeric deltas and single-object patches (ADR-0032). Every
 * other operation already carries its complete validated value.
 */
const readProjectedOperations = (
	plan: SchemaValidationPlan,
	update: unknown,
): readonly ProjectedOperation[] => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) return []

	return update.operations.flatMap((operation, index) => {
		if (!isPlainRecord(operation) || typeof operation.field !== 'string') {
			return []
		}
		const fieldPlan = Object.hasOwn(plan.fields, operation.field)
			? plan.fields[operation.field]
			: undefined
		const projected =
			operation.kind === 'increment' ||
			operation.kind === 'decrement' ||
			(operation.kind === 'set' &&
				fieldPlan?.kind === 'object' &&
				isPlainRecord(operation.value))

		return projected ? [{ field: operation.field, index }] : []
	})
}

/** Validates the complete values one update would store on one locked target. */
const validateProjectedTarget = (
	schema: SchemaDefinition,
	plan: SchemaValidationPlan,
	update: Readonly<Record<string, unknown>>,
	operations: readonly ProjectedOperation[],
	target: LogicalRecord,
): readonly ValidationIssue<AnyValidationIssueCode>[] => {
	// A narrowed target cannot project a field it does not hold.
	const projectable = operations.filter(({ field }) =>
		Object.hasOwn(target, field),
	)
	if (projectable.length === 0 || !isUnknownArray(update.operations)) return []

	const sourceOperations = update.operations
	const projection = applyUpdateExpressionToRecord(
		schema,
		target,
		immutableRecord({
			kind: 'update-expression',
			operations: projectable.map(({ index }) => sourceOperations[index]),
		}),
	)
	const execution = createStructuralValidationExecution()

	for (const { field, index } of projectable) {
		const fieldPlan = plan.fields[field]

		if (fieldPlan !== undefined) {
			validateFieldValue(
				fieldPlan,
				projection[field],
				['update', index, field, 'value'],
				execution,
				false,
			)
		}
	}

	return execution.issues
}

/**
 * Rejects an update whose stored result would be invalid (ADR-0060,
 * ADR-0032): an atomic delta leaving the field's range, or an object patch
 * applied to a stored `null` without the object's required children. The
 * database computes these values from the target that Runtime already holds
 * locked, so Core projects them here instead of letting the adapter fail to
 * read the row back. Each issue names the update operation's value, once
 * however many prepared targets it would break.
 */
export const throwProjectedUpdateIssues = (
	schema: SchemaDefinition,
	plans: SchemaValidationPlans,
	operation: unknown,
	target: unknown,
	targets: readonly unknown[] | undefined,
): void => {
	if (!isPlainRecord(operation)) return
	const candidates =
		operation.kind === 'update-many'
			? (targets ?? [])
			: operation.kind === 'update-one' || operation.kind === 'upsert-one'
				? [target]
				: []
	const update = operation.update
	if (candidates.length === 0 || !isPlainRecord(update)) return

	const plan = readOutputPlan(plans)
	const operations = readProjectedOperations(plan, update)
	if (operations.length === 0) return

	const issues = new Map<string, ValidationIssue<AnyValidationIssueCode>>()

	for (const candidate of candidates) {
		// `null` is an absent target: an update has nothing to project, an upsert creates.
		if (!isPlainRecord(candidate)) continue

		for (const issue of validateProjectedTarget(
			schema,
			plan,
			update,
			operations,
			candidate,
		)) {
			const key = JSON.stringify([issue.code, issue.path])
			if (!issues.has(key)) issues.set(key, issue)
		}
	}

	if (issues.size > 0) throwRuntimeValidationIssues([...issues.values()])
}

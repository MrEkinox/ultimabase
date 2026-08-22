import type { UpdateExpressionNode } from '../../query/index.js'
import { applyUpdateExpressionToRecord } from '../../query/index.js'
import {
	Schema,
	type AnyValidationIssueCode,
	type FieldValidationPlan,
	type SchemaValidationPlan,
	type SchemaValidationPlans,
	type ValidationIssue,
	type ValidationIssuePath,
} from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
} from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import { validateFieldStandardSchema } from './field-standard-schema.js'
import {
	snapshotRuntimeResultRecord,
	throwRuntimeValidationIssues,
} from './runtime-validation.js'

interface ArithmeticFieldOccurrence {
	readonly field: string
	readonly plan: FieldValidationPlan
	readonly path: ValidationIssuePath
}

const hasApplicationValidator = (plan: FieldValidationPlan): boolean =>
	Reflect.get(plan.field.options, 'validation') !== undefined

/** Selects only complete-value validators whose update operand is a delta. */
const readArithmeticFields = (
	update: unknown,
	plan: SchemaValidationPlan,
	path: ValidationIssuePath,
): readonly ArithmeticFieldOccurrence[] => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return immutableArray([])
	}

	const fields = new Map<string, ArithmeticFieldOccurrence>()

	for (const [index, operation] of update.operations.entries()) {
		if (
			!isPlainRecord(operation) ||
			(operation.kind !== 'increment' && operation.kind !== 'decrement') ||
			typeof operation.field !== 'string'
		) {
			continue
		}

		const fieldPlan = plan.fields[operation.field]

		if (fieldPlan !== undefined && hasApplicationValidator(fieldPlan)) {
			fields.set(
				operation.field,
				immutableRecord({
					field: operation.field,
					path: immutableArray([...path, index, operation.field, 'value']),
					plan: fieldPlan,
				}),
			)
		}
	}

	return immutableArray([...fields.values()])
}

/** Removes relation deltas that do not participate in scalar projection. */
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

const createUnavailableTargetIssues = (
	fields: readonly ArithmeticFieldOccurrence[],
	message: string,
): readonly ValidationIssue<AnyValidationIssueCode>[] =>
	immutableArray(
		fields.map(({ path }) =>
			immutableRecord({
				code: 'field.validation' as const,
				message,
				path,
			}),
		),
	)

/** Validates projected values while retaining the original atomic expression. */
const validateTargetProjection = (
	schema: Parameters<typeof applyUpdateExpressionToRecord>[0],
	plans: SchemaValidationPlans,
	update: unknown,
	fields: readonly ArithmeticFieldOccurrence[],
	target: Readonly<Record<string, unknown>>,
	targetPath: ValidationIssuePath,
): readonly ValidationIssue<AnyValidationIssueCode>[] => {
	const stableTarget = snapshotRuntimeResultRecord(plans, target, targetPath)
	const projected = applyUpdateExpressionToRecord(
		schema,
		stableTarget,
		createProjectableUpdate(update),
	)
	const stableProjection = snapshotRuntimeResultRecord(
		plans,
		projected,
		targetPath,
	)
	const issues: ValidationIssue<AnyValidationIssueCode>[] = []

	for (const { field, path, plan } of fields) {
		const value: unknown = stableProjection[field]

		if (value !== undefined && value !== null) {
			issues.push(...validateFieldStandardSchema(plan.field, value, path))
		}
	}

	return immutableArray(issues)
}

const validateUpdateTargets = (
	operationKind: 'update-many' | 'update-one' | 'upsert-one',
	update: unknown,
	path: ValidationIssuePath,
	plans: SchemaValidationPlans,
	target: Readonly<Record<string, unknown>> | null | undefined,
	targets: readonly Readonly<Record<string, unknown>>[] | undefined,
	schema: Parameters<typeof applyUpdateExpressionToRecord>[0],
): void => {
	const fields = readArithmeticFields(update, plans.update, path)

	if (
		fields.length === 0 ||
		(operationKind === 'update-one' && target === null)
	) {
		return
	}

	if (operationKind === 'update-many') {
		if (targets === undefined) {
			return throwRuntimeValidationIssues(
				createUnavailableTargetIssues(
					fields,
					'Validated bulk arithmetic requires complete prepared targets',
				),
			)
		}

		const issues = targets.flatMap((item, index) =>
			validateTargetProjection(schema, plans, update, fields, item, [
				'targets',
				index,
			]),
		)

		if (issues.length > 0) throwRuntimeValidationIssues(issues)
		return
	}

	if (operationKind === 'upsert-one' && target === null) {
		return throwRuntimeValidationIssues(
			createUnavailableTargetIssues(
				fields,
				'Targetless upsert arithmetic cannot validate a concurrent update result',
			),
		)
	}

	if (target === undefined || target === null) {
		throw new TypeError(
			'Directed arithmetic validation requires a prepared target',
		)
	}

	const issues = validateTargetProjection(
		schema,
		plans,
		update,
		fields,
		target,
		['target'],
	)

	if (issues.length > 0) throwRuntimeValidationIssues(issues)
}

/** Enforces final-value validators for atomic operations after input resolution. */
export const validateProjectedMutationArithmetic = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	operation: TOperation,
	plans: SchemaValidationPlans,
	target: DatabaseMutationLogicalRecord<TOperation> | null | undefined,
	targets: readonly DatabaseMutationLogicalRecord<TOperation>[] | undefined,
): void => {
	const schema = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Projected arithmetic requires a schema definition')
	}
	const candidate: unknown = operation

	if (!isPlainRecord(candidate)) {
		throw new TypeError('Projected arithmetic requires a mutation operation')
	}

	switch (candidate.kind) {
		case 'update-one':
		case 'update-many':
			validateUpdateTargets(
				candidate.kind,
				candidate.update,
				['update'],
				plans,
				target,
				targets,
				schema,
			)
			return
		case 'upsert-one':
			validateUpdateTargets(
				candidate.kind,
				candidate.update,
				['update'],
				plans,
				target,
				targets,
				schema,
			)
			return
		case 'upsert-many': {
			const fields = isUnknownArray(candidate.items)
				? candidate.items.flatMap((item, index) =>
						isPlainRecord(item)
							? readArithmeticFields(item.update, plans.update, [
									'items',
									index,
									'update',
								])
							: [],
					)
				: []

			if (fields.length > 0) {
				throwRuntimeValidationIssues(
					createUnavailableTargetIssues(
						fields,
						'Validated bulk upsert arithmetic requires per-item prepared targets',
					),
				)
			}
		}
	}
}

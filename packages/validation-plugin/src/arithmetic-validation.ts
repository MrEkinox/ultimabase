import {
	applyUpdateExpressionToRecord,
	snapshotRuntimeResultRecord,
	type DatabaseMutationOperationAst,
	type GenericField,
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
import { readFieldValidator } from './field-validator.js'

type Path = readonly (number | string)[]

interface ArithmeticField {
	readonly field: string
	readonly path: Path
	readonly validator: unknown
}

export const readArithmeticFields = (
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
export const validateArithmetic = async (
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


import type {
	FieldValidationPlan,
	SchemaDefinition,
} from '../../schema/index.js'
import { Schema } from '../../schema/index.js'
import { applyDecimalDelta } from '../../schema/fields/builtins/decimal.js'
import { compileFieldValidationPlan } from '../../schema/plans/compiler.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { UpdateExpressionNode } from './contracts.js'
import { readUpdateExpressionOperations } from './structure.js'

type LogicalRecord = Readonly<Record<string, unknown>>
type MutableLogicalRecord = Record<string, unknown>

/** Applies one validated numeric operation while preserving its runtime scalar type. */
const applyNumericOperation = (
	fieldKind: string,
	current: unknown,
	delta: unknown,
	operation: 'decrement' | 'increment',
): unknown => {
	if (current === null) return null

	switch (fieldKind) {
		case 'bigint':
			if (typeof current !== 'bigint' || typeof delta !== 'bigint') {
				throw new TypeError('BigInt update operands must be bigint values')
			}

			return operation === 'increment' ? current + delta : current - delta
		case 'decimal':
			if (typeof current !== 'string' || typeof delta !== 'string') {
				throw new TypeError('Decimal update operands must be exact strings')
			}

			return applyDecimalDelta(current, delta, operation)
		case 'float':
		case 'int':
			if (typeof current !== 'number' || typeof delta !== 'number') {
				throw new TypeError('Numeric update operands must be numbers')
			}

			return operation === 'increment' ? current + delta : current - delta
		default:
			throw new TypeError(
				`Field kind ${fieldKind} does not support numeric updates`,
			)
	}
}

/**
 * Merges one object patch into its stored value (ADR-0032): omitted children
 * keep their stored values and nested objects merge recursively, while lists,
 * JSON values and `null` replace. Without a stored object the patch is the value.
 */
const applyObjectPatch = (
	plan: FieldValidationPlan,
	current: unknown,
	patch: unknown,
): unknown => {
	if (
		plan.kind !== 'object' ||
		!isPlainRecord(patch) ||
		!isPlainRecord(current)
	) {
		return patch
	}

	const patched = Object.entries(patch).map(
		([name, value]): [string, unknown] => {
			const child = Object.hasOwn(plan.fields, name)
				? plan.fields[name]
				: undefined
			const stored = Object.hasOwn(current, name) ? current[name] : undefined

			return [
				name,
				child === undefined ? value : applyObjectPatch(child, stored, value),
			]
		},
	)

	// Later entries win, and `Object.fromEntries` never invokes `__proto__` setters.
	return immutableRecord(
		Object.fromEntries([...Object.entries(current), ...patched]),
	)
}

/**
 * Applies one normalized update expression to an immutable logical snapshot.
 *
 * The helper is adapter-neutral and is intended for transaction-bound plugin
 * callbacks that already own a locked current record.
 */
export const applyUpdateExpressionToRecord = <
	const TRecord extends LogicalRecord,
>(
	schema: SchemaDefinition,
	record: TRecord,
	update: UpdateExpressionNode,
): Readonly<TRecord> => {
	if (!Schema.is(schema) || !isPlainRecord(record)) {
		throw new TypeError('Update application requires a schema logical record')
	}

	const candidate: MutableLogicalRecord = { ...record }

	for (const operation of readUpdateExpressionOperations(
		update,
		'Update application requires an update expression',
	)) {
		if (
			typeof operation.field !== 'string' ||
			!Object.hasOwn(schema.persistedFields, operation.field)
		) {
			throw new TypeError('Update application references an unknown field')
		}

		const field = schema.persistedFields[operation.field]

		if (field === undefined) {
			throw new TypeError('Update application references a missing field')
		}

		switch (operation.kind) {
			case 'set':
				if (!Object.hasOwn(operation, 'value')) {
					throw new TypeError('Set update application requires a value')
				}

				candidate[operation.field] = applyObjectPatch(
					compileFieldValidationPlan(field, 'update'),
					candidate[operation.field],
					operation.value,
				)
				break
			case 'decrement':
			case 'increment':
				if (!Object.hasOwn(operation, 'value')) {
					throw new TypeError('Numeric update application requires a delta')
				}

				if (!Object.hasOwn(candidate, operation.field)) break

				candidate[operation.field] = applyNumericOperation(
					field.kind,
					candidate[operation.field],
					operation.value,
					operation.kind,
				)
				break
			default:
				throw new TypeError(
					`Unsupported update application operation: ${String(operation.kind)}`,
				)
		}
	}

	return immutableRecord(candidate) as Readonly<TRecord>
}

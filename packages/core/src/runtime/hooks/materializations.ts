import { isDeepStrictEqual } from 'node:util'

import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { UpdateExpressionNode } from '../../query/index.js'
import type {
	FieldHookMode,
	FieldValueChange,
} from '../../schema/hooks/field-contracts.js'
import type { GenericField } from '../../schema/index.js'
import type {
	DatabaseLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationOutcome,
} from '../database/contracts.js'
import {
	collectOperationFieldInputs,
	collectRecordFieldValues,
	collectUpdateExpressionFieldNames,
	getRuntimeOperationFields,
	type RuntimeFieldValue,
} from './field-inputs.js'

/** Adds the exact mutation item and lifecycle mode to one present field value. */
export interface RuntimeMutationFieldValue extends RuntimeFieldValue {
	readonly itemIndex: number
	readonly kind: DatabaseMutationOperationAst['kind']
	readonly mode: FieldHookMode
}

/** Describes one semantic field transition retained until transaction commit. */
export interface RuntimeMutationFieldChange {
	readonly change: FieldValueChange<unknown>
	readonly field: GenericField
	readonly fieldPath: readonly string[]
	readonly itemIndex: number
	readonly kind: DatabaseMutationOperationAst['kind']
	readonly timing: 'before-commit'
	readonly valuePath: RuntimeFieldValue['valuePath']
}

type MutationMaterialization =
	DatabaseOperationOutcome<DatabaseMutationOperationAst>['materializations'][number]

const emptyMutationValues: readonly RuntimeMutationFieldValue[] =
	immutableArray([])
const emptyMutationChanges: readonly RuntimeMutationFieldChange[] =
	immutableArray([])

const attachMutationContext = (
	values: readonly RuntimeFieldValue[],
	kind: DatabaseMutationOperationAst['kind'],
	mode: FieldHookMode,
	itemIndex: number,
): readonly RuntimeMutationFieldValue[] =>
	immutableArray(
		values.map((value) => immutableRecord({ ...value, itemIndex, kind, mode })),
	)

/** Rejects an incomplete prepared stage instead of silently skipping field hooks. */
const requireSingularTarget = (
	target: DatabaseLogicalRecord | null | undefined,
): DatabaseLogicalRecord | null => {
	if (target === undefined) {
		throw new TypeError(
			'Runtime singular mutation field hooks require a prepared target',
		)
	}

	return target
}

/** Produces parent-first field values for mutation effects before persistence. */
export const collectMutationBeforeFieldValues = (
	operation: DatabaseMutationOperationAst,
	target: DatabaseLogicalRecord | null | undefined,
): readonly RuntimeMutationFieldValue[] => {
	if (operation.kind === 'delete-many' || operation.kind === 'update-many') {
		return emptyMutationValues
	}

	if (operation.kind === 'delete-one') {
		const preparedTarget = requireSingularTarget(target)

		return preparedTarget === null
			? emptyMutationValues
			: attachMutationContext(
					collectRecordFieldValues(
						getRuntimeOperationFields(operation),
						preparedTarget,
						'parent-first',
					),
					operation.kind,
					'object',
					0,
				)
	}

	if (operation.kind === 'update-one') {
		if (requireSingularTarget(target) === null) {
			return emptyMutationValues
		}
	}

	return immutableArray(
		collectOperationFieldInputs(operation, 'parent-first').map((input) =>
			immutableRecord({
				field: input.field,
				fieldPath: input.fieldPath,
				itemIndex: input.itemIndex,
				kind: operation.kind,
				mode: input.mode,
				value: input.value,
				valuePath: input.valuePath,
			}),
		),
	)
}

const readUpdateForItem = (
	operation: DatabaseMutationOperationAst,
	itemIndex: number,
): UpdateExpressionNode | undefined => {
	const untrustedOperation = operation as unknown as Readonly<
		Record<string, unknown>
	>

	if (operation.kind === 'update-one') {
		return untrustedOperation.update as UpdateExpressionNode
	}

	if (operation.kind === 'upsert-one') {
		return untrustedOperation.update as UpdateExpressionNode
	}

	if (operation.kind !== 'upsert-many') {
		return undefined
	}

	const items: unknown = untrustedOperation.items

	if (!Array.isArray(items)) {
		throw new TypeError('Runtime materializations require upsert items')
	}

	const item: unknown = items[itemIndex]

	if (typeof item !== 'object' || item === null || !('update' in item)) {
		throw new TypeError('Runtime materialization has no matching upsert item')
	}

	return item.update as UpdateExpressionNode
}

/** Recovers the update candidate required by one materialized update branch. */
const requireUpdateForItem = (
	operation: DatabaseMutationOperationAst,
	itemIndex: number,
): UpdateExpressionNode => {
	const update = readUpdateForItem(operation, itemIndex)

	if (update === undefined) {
		throw new TypeError(
			'Runtime update materialization has no update expression',
		)
	}

	return update
}

const collectAffectedValues = (
	operation: DatabaseMutationOperationAst,
	materialization: MutationMaterialization,
	itemIndex: number,
): readonly RuntimeMutationFieldValue[] => {
	const fields = getRuntimeOperationFields(operation)
	const record =
		materialization.kind === 'delete'
			? materialization.previous
			: materialization.current
	const mode: FieldHookMode =
		materialization.kind === 'delete' ? 'object' : materialization.kind
	let values = collectRecordFieldValues(fields, record, 'parent-first')

	if (materialization.kind === 'update') {
		const update = requireUpdateForItem(operation, itemIndex)
		const affectedNames = new Set(collectUpdateExpressionFieldNames(update))
		values = immutableArray(
			values.filter((value) => {
				const topLevelName = value.fieldPath[0]

				return topLevelName !== undefined && affectedNames.has(topLevelName)
			}),
		)
	}

	// After phases unwind the exact parent-first traversal within each stable item.
	return attachMutationContext(
		immutableArray([...values].reverse()),
		operation.kind,
		mode,
		itemIndex,
	)
}

/** Produces child-first after-hook values without exposing selected public results. */
export const collectMutationAfterFieldValues = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	operation: TOperation,
	outcome: DatabaseOperationOutcome<TOperation>,
): readonly RuntimeMutationFieldValue[] => {
	if (operation.kind === 'delete-many' || operation.kind === 'update-many') {
		return emptyMutationValues
	}

	const values: RuntimeMutationFieldValue[] = []

	for (const [
		itemIndex,
		materialization,
	] of outcome.materializations.entries()) {
		values.push(...collectAffectedValues(operation, materialization, itemIndex))
	}

	return immutableArray(values)
}

interface PresentRecordValue extends RuntimeFieldValue {
	readonly value: unknown
}

const indexRecordValues = (
	fields: Readonly<Record<string, GenericField>>,
	record: Readonly<Record<string, unknown>> | undefined,
): Readonly<{
	order: readonly string[]
	values: ReadonlyMap<string, PresentRecordValue>
}> => {
	if (record === undefined) {
		return immutableRecord({ order: immutableArray([]), values: new Map() })
	}

	const values = new Map<string, PresentRecordValue>()
	const order: string[] = []

	for (const value of collectRecordFieldValues(
		fields,
		record,
		'parent-first',
	)) {
		const key = JSON.stringify(value.valuePath)
		values.set(key, value)
		order.push(key)
	}

	return immutableRecord({ order: immutableArray(order), values })
}

const createValueChange = (
	previous: PresentRecordValue | undefined,
	current: PresentRecordValue | undefined,
): FieldValueChange<unknown> | undefined => {
	if (previous === undefined && current === undefined) {
		return undefined
	}

	if (previous === undefined && current !== undefined) {
		return immutableRecord({
			previous: immutableRecord({ present: false as const }),
			current: immutableRecord({
				present: true as const,
				value: current.value,
			}),
		})
	}

	if (previous !== undefined && current === undefined) {
		return immutableRecord({
			previous: immutableRecord({
				present: true as const,
				value: previous.value,
			}),
			current: immutableRecord({ present: false as const }),
		})
	}

	if (
		previous === undefined ||
		current === undefined ||
		isDeepStrictEqual(previous.value, current.value)
	) {
		return undefined
	}

	return immutableRecord({
		previous: immutableRecord({
			present: true as const,
			value: previous.value,
		}),
		current: immutableRecord({ present: true as const, value: current.value }),
	})
}

const collectMaterializationChanges = (
	operation: DatabaseMutationOperationAst,
	materialization: MutationMaterialization,
	itemIndex: number,
): readonly RuntimeMutationFieldChange[] => {
	const fields = getRuntimeOperationFields(operation)
	const previousRecord =
		materialization.kind === 'create' ? undefined : materialization.previous
	const currentRecord =
		materialization.kind === 'delete' ? undefined : materialization.current
	const previous = indexRecordValues(fields, previousRecord)
	const current = indexRecordValues(fields, currentRecord)
	const affectedNames =
		materialization.kind === 'update'
			? new Set(
					collectUpdateExpressionFieldNames(
						requireUpdateForItem(operation, itemIndex),
					),
				)
			: undefined
	const orderedKeys = [...previous.order]

	for (const key of current.order) {
		if (!previous.values.has(key)) {
			orderedKeys.push(key)
		}
	}

	const changes: RuntimeMutationFieldChange[] = []

	for (const key of orderedKeys.reverse()) {
		const previousValue = previous.values.get(key)
		const currentValue = current.values.get(key)
		const descriptor = currentValue ?? previousValue

		if (descriptor === undefined) {
			continue
		}

		const topLevelName = descriptor.fieldPath[0]

		if (
			affectedNames !== undefined &&
			(topLevelName === undefined || !affectedNames.has(topLevelName))
		) {
			continue
		}

		const change = createValueChange(previousValue, currentValue)

		if (change === undefined) {
			continue
		}

		changes.push(
			immutableRecord({
				change,
				field: descriptor.field,
				fieldPath: descriptor.fieldPath,
				itemIndex,
				kind: operation.kind,
				timing: 'before-commit' as const,
				valuePath: descriptor.valuePath,
			}),
		)
	}

	return immutableArray(changes)
}

/** Produces only real child-first semantic changes for materialized mutations. */
export const collectMutationFieldChanges = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	operation: TOperation,
	outcome: DatabaseOperationOutcome<TOperation>,
): readonly RuntimeMutationFieldChange[] => {
	if (operation.kind === 'delete-many' || operation.kind === 'update-many') {
		return emptyMutationChanges
	}

	const changes: RuntimeMutationFieldChange[] = []

	for (const [
		itemIndex,
		materialization,
	] of outcome.materializations.entries()) {
		changes.push(
			...collectMaterializationChanges(operation, materialization, itemIndex),
		)
	}

	return immutableArray(changes)
}

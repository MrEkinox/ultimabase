import {
	Pointer,
	applyUpdateExpressionToRecord,
	collectOperationFieldInputs,
	collectRecordFieldValues,
	isRelationUpdateExpression,
	type DatabaseOperationAst,
	type RuntimeFieldInputValue,
	type RuntimeOperationStageInput,
	type SchemaDefinition,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { FieldWriteAccessTransition } from '../authoring/field-declarations.js'
import type { FieldAccessPlan } from '../authoring/plan.js'
import {
	assertAccessRules,
	createAccessDeniedError,
	type AccessScope,
} from './rule-evaluation.js'

/** Reuses Core's canonical traversal instead of decoding update expressions again. */
export const collectUpdateFieldValues = (
	inputs: readonly RuntimeFieldInputValue[],
	itemIndex = 0,
): ReadonlyMap<string, unknown> => {
	const values = new Map<string, unknown>()
	for (const input of inputs) {
		const [fieldName, nestedFieldName] = input.fieldPath
		if (
			input.mode === 'update' &&
			input.itemIndex === itemIndex &&
			fieldName !== undefined &&
			nestedFieldName === undefined
		) {
			values.set(fieldName, input.value)
		}
	}
	return values
}

/** Applies one scalar update without treating relation deltas as embedded values. */
export const createAccessUpdateCandidate = (
	schema: SchemaDefinition,
	update: UpdateExpressionNode,
	originalItem: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	isRelationUpdateExpression(update)
		? immutableRecord({ ...originalItem })
		: applyUpdateExpressionToRecord(schema, originalItem, update)

type RecordFieldValue = ReturnType<typeof collectRecordFieldValues>[number]

/** Indexes each concrete value by field identity, then by its value path. */
const indexRecordFieldValues = (
	schema: SchemaDefinition,
	record: Readonly<Record<string, unknown>>,
): ReadonlyMap<RecordFieldValue['field'], ReadonlyMap<string, unknown>> => {
	const indexed = new Map<RecordFieldValue['field'], Map<string, unknown>>()
	for (const value of collectRecordFieldValues(
		schema.fields,
		record,
		'parent-first',
	)) {
		let fieldValues = indexed.get(value.field)
		if (fieldValues === undefined) {
			fieldValues = new Map()
			indexed.set(value.field, fieldValues)
		}
		fieldValues.set(JSON.stringify(value.valuePath), value.value)
	}
	return indexed
}

/** Evaluates fill, replace, and clear once a locked target yields final values. */
export const evaluateAccessPreparedUpdateFieldRules = async (
	scope: AccessScope,
	originalItem: Readonly<Record<string, unknown>>,
	item: Readonly<Record<string, unknown>>,
	updateFields: ReadonlyMap<string, unknown>,
): Promise<void> => {
	const { context, schemaPlan } = scope
	const originalValues = indexRecordFieldValues(schemaPlan.schema, originalItem)
	const values = indexRecordFieldValues(schemaPlan.schema, item)

	for (const field of schemaPlan.fields) {
		if (
			!updateFields.has(field.path[0] ?? '') ||
			field.field.kind === 'relation'
		) {
			continue
		}
		const originalByPath = originalValues.get(field.field)
		const valueByPath = values.get(field.field)
		const valuePaths = new Set([
			...(originalByPath?.keys() ?? []),
			...(valueByPath?.keys() ?? []),
		])

		for (const valuePath of valuePaths) {
			const originalValue = originalByPath?.get(valuePath) ?? null
			const value = valueByPath?.get(valuePath) ?? null
			const transition: FieldWriteAccessTransition =
				value === null ? 'clear' : originalValue === null ? 'fill' : 'replace'
			await assertAccessRules(
				scope,
				field.write[transition],
				{ branch: transition, field, phase: 'access-field-write' },
				transition === 'clear'
					? immutableRecord({ context, originalValue })
					: transition === 'fill'
						? immutableRecord({ context, value })
						: immutableRecord({ context, originalValue, value }),
			)
		}
	}
}

/** Checks every non-null value a create input fills. */
export const evaluateAccessCreateFillRules = async (
	scope: AccessScope,
	inputs: readonly RuntimeFieldInputValue[],
): Promise<void> => {
	for (const input of inputs) {
		if (input.mode !== 'create' || input.value === null) continue
		const field = scope.plan.getField(scope.schema, input.fieldPath)
		if (field?.field !== input.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent create target',
			)
		}
		await assertAccessRules(
			scope,
			field.write.fill,
			{ branch: 'fill', field, phase: 'access-field-write' },
			immutableRecord({ context: scope.context, value: input.value }),
		)
	}
}

/** Checks relation edge changes for every updated relation root field. */
export const evaluateAccessRelationWriteRules = async (
	scope: AccessScope,
	updateFields: ReadonlyMap<string, unknown>,
): Promise<void> => {
	for (const field of scope.schemaPlan.fields) {
		const [rootFieldName] = field.path
		if (
			field.field.kind !== 'relation' ||
			rootFieldName === undefined ||
			!updateFields.has(rootFieldName)
		) {
			continue
		}
		await assertAccessRules(
			scope,
			field.relationWrite,
			{ branch: 'write', field, phase: 'access-field-write' },
			immutableRecord({
				change: updateFields.get(rootFieldName),
				context: scope.context,
			}),
		)
	}
}

/** Returns one static decision only when every transition agrees. */
export const readAccessStaticWriteDecision = (
	field: FieldAccessPlan,
): boolean | undefined => {
	let decision: boolean | undefined
	for (const transition of ['fill', 'replace', 'clear'] as const) {
		let transitionDecision = true
		for (const { rule } of field.write[transition]) {
			if (typeof rule === 'function') return undefined
			if (!rule) transitionDecision = false
		}
		if (decision !== undefined && transitionDecision !== decision) {
			return undefined
		}
		decision = transitionDecision
	}
	return decision
}

/** Owns early create fills, static write denials, and relation changes. */
export const evaluateAccessMutationFieldRules = async (
	scope: AccessScope,
	operation: DatabaseOperationAst,
	nestedWrite: RuntimeOperationStageInput<DatabaseOperationAst>['nestedWrite'],
): Promise<void> => {
	const inputs = collectOperationFieldInputs(operation, 'parent-first')
	await evaluateAccessCreateFillRules(
		scope,
		inputs.filter(
			(input) => input.kind !== 'upsert-one' && input.kind !== 'upsert-many',
		),
	)
	// Upsert values depend on the branch the database selects later.
	if (operation.kind === 'upsert-one' || operation.kind === 'upsert-many') {
		return
	}

	for (const input of inputs) {
		if (input.mode !== 'update' || input.field.kind === 'relation') continue
		const field = scope.plan.getField(scope.schema, input.fieldPath)
		if (field?.field !== input.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent update target',
			)
		}
		// Only a write denied by every transition can be rejected before the
		// target is loaded; value-dependent rules wait for the prepared target.
		if (readAccessStaticWriteDecision(field) === false) {
			throw createAccessDeniedError(
				'access-field-write',
				scope.operation,
				field,
			)
		}
	}

	await evaluateAccessRelationWriteRules(
		scope,
		collectUpdateFieldValues(inputs),
	)

	for (const relationship of nestedWrite?.node.relationships ?? []) {
		if (relationship.kind !== 'relation') continue
		const targets =
			relationship.command === 'create'
				? relationship.children.map((child) => {
						if (child.reservedId === undefined) {
							throw new TypeError(
								'Access nested relation create is missing its reserved identity',
							)
						}
						return new Pointer(relationship.target, child.reservedId)
					})
				: relationship.ids.map((id) => new Pointer(relationship.target, id))
		await evaluateAccessRelationWriteRules(
			scope,
			new Map([
				[
					relationship.fieldName,
					immutableRecord({
						action: relationship.command,
						targets: immutableArray(targets),
					}),
				],
			]),
		)
	}
}

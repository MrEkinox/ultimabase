import type {
	DatabaseOperationAst,
	RuntimeFieldInputValue,
	RuntimeOperationStageInput,
	SchemaDefinition,
	UpdateExpressionNode,
} from '@ultimabase/core'
import {
	applyUpdateExpressionToRecord,
	collectOperationFieldInputs,
	collectRecordFieldValues,
	isRelationUpdateExpression,
	Pointer,
} from '@ultimabase/core'
import type { FieldWriteAccessTransition } from '../authoring/field-declarations.js'
import type {
	AccessPlan,
	FieldAccessPlan,
	SchemaAccessPlan,
} from '../authoring/plan.js'
import { allowUndeclaredFieldAccess } from '../authoring/plan.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AccessExecutionRuntime } from './execution-runtime.js'
import { assertAccessDecisionRules } from './rule-evaluation.js'

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
type RecordFieldValuesByField = ReadonlyMap<
	RecordFieldValue['field'],
	ReadonlyMap<string, RecordFieldValue>
>

/** Indexes each concrete value once for every Access field that consumes it. */
const indexRecordFieldValues = (
	values: readonly RecordFieldValue[],
): RecordFieldValuesByField => {
	const indexed = new Map<
		RecordFieldValue['field'],
		Map<string, RecordFieldValue>
	>()

	for (const value of values) {
		let fieldValues = indexed.get(value.field)

		if (fieldValues === undefined) {
			fieldValues = new Map()
			indexed.set(value.field, fieldValues)
		}

		fieldValues.set(JSON.stringify(value.valuePath), value)
	}

	return indexed
}

/** Evaluates callback transitions after a locked target yields final values. */
export const evaluateAccessPreparedUpdateFieldRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
	defaultFieldDecision: boolean,
	originalItem: Readonly<Record<string, unknown>>,
	item: Readonly<Record<string, unknown>>,
	updateFields: ReadonlyMap<string, unknown>,
): Promise<void> => {
	const originalValues = indexRecordFieldValues(
		collectRecordFieldValues(
			schemaPlan.schema.fields,
			originalItem,
			'parent-first',
		),
	)
	const values = indexRecordFieldValues(
		collectRecordFieldValues(schemaPlan.schema.fields, item, 'parent-first'),
	)

	const updatedFields = new Set(updateFields.keys())

	for (const field of schemaPlan.fields) {
		if (
			!updatedFields.has(field.path[0] ?? '') ||
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
			const originalValue = originalByPath?.get(valuePath)?.value ?? null
			const value = valueByPath?.get(valuePath)?.value ?? null
			const transition: FieldWriteAccessTransition =
				value === null ? 'clear' : originalValue === null ? 'fill' : 'replace'
			const rules = field.write[transition]
			const input =
				transition === 'clear'
					? immutableRecord({
							context: request.context,
							originalValue,
						})
					: transition === 'fill'
						? immutableRecord({ context: request.context, value })
						: immutableRecord({
								context: request.context,
								originalValue,
								value,
							})

			await assertAccessDecisionRules(
				runtime,
				request,
				rules,
				{
					branch: transition,
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				input,
				rules.length === 0 ? defaultFieldDecision : true,
			)
		}
	}
}

export const evaluateAccessCreateFillRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	inputs: readonly RuntimeFieldInputValue[],
): Promise<void> => {
	for (const input of inputs) {
		if (input.mode !== 'create' || input.value === null) continue

		const field = plan.getField(schemaPlan.schema, input.fieldPath)

		if (field?.field !== input.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent create target',
			)
		}

		await assertAccessDecisionRules(
			runtime,
			request,
			field.write.fill,
			{
				branch: 'fill',
				field,
				phase: 'access-field-write',
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				value: input.value,
			}),
			allowUndeclaredFieldAccess,
		)
	}
}

export const evaluateAccessRelationWriteRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
	updateFields: ReadonlyMap<string, unknown>,
): Promise<void> => {
	for (const field of schemaPlan.fields) {
		const [rootFieldName] = field.path

		if (
			field.field.kind !== 'relation' ||
			rootFieldName === undefined ||
			!updateFields.has(rootFieldName)
		) {
			continue
		}
		const change = updateFields.get(rootFieldName)

		await assertAccessDecisionRules(
			runtime,
			request,
			field.relationWrite,
			{
				branch: 'write',
				field,
				phase: 'access-field-write',
				schema: schemaPlan.schema,
			},
			immutableRecord({ change, context: request.context }),
			field.relationWrite.length === 0 ? allowUndeclaredFieldAccess : true,
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

/** Owns early field references, static writes, create fills, and relations. */
export const evaluateAccessMutationFieldRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	const inputs = collectOperationFieldInputs(request.operation, 'parent-first')

	await evaluateAccessCreateFillRules(
		runtime,
		request,
		plan,
		schemaPlan,
		inputs.filter(
			(input) => input.kind !== 'upsert-one' && input.kind !== 'upsert-many',
		),
	)

	if (
		request.operation.kind === 'upsert-one' ||
		request.operation.kind === 'upsert-many'
	) {
		return
	}

	for (const input of inputs) {
		if (input.mode !== 'update' || input.field.kind === 'relation') continue

		const field = plan.getField(schemaPlan.schema, input.fieldPath)

		if (field?.field !== input.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent update target',
			)
		}

		const writeRules = Object.values(field.write)

		if (writeRules.every((rules) => rules.length === 0)) {
			await assertAccessDecisionRules(
				runtime,
				request,
				[],
				{
					branch: 'write',
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				immutableRecord({ context: request.context }),
				allowUndeclaredFieldAccess,
			)
			continue
		}

		const staticDecision = readAccessStaticWriteDecision(field)

		if (staticDecision === false) {
			await assertAccessDecisionRules(
				runtime,
				request,
				writeRules.flat(),
				{
					branch: 'write',
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				immutableRecord({ context: request.context }),
				true,
			)
		}
	}

	await evaluateAccessRelationWriteRules(
		runtime,
		request,
		schemaPlan,
		collectUpdateFieldValues(inputs),
	)

	for (const relationship of request.nestedWrite?.node.relationships ?? []) {
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
			runtime,
			request,
			schemaPlan,
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

import type {
	DatabaseOperationAst,
	ExecutableOperationAst,
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
} from '@ultimabase/core'
import type { FieldWriteAccessTransition } from '../authoring/field-declarations.js'
import type {
	AccessPlan,
	FieldAccessPlan,
	SchemaAccessPlan,
} from '../authoring/plan.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { AccessExecutionRuntime } from './execution-runtime.js'
import { accessFieldPathsEqual } from './field-paths.js'
import { assertAccessDecisionRules } from './rule-evaluation.js'

const readUpdateFieldValues = (
	operation: ExecutableOperationAst,
): ReadonlyMap<string, unknown> => {
	const values = new Map<string, unknown>()
	const updates =
		operation.kind === 'update-one' || operation.kind === 'update-many'
			? [operation.update]
			: operation.kind === 'upsert-one'
				? [operation.update]
				: operation.kind === 'upsert-many'
					? operation.items.map(({ update }) => update)
					: []

	for (const update of updates) {
		appendUpdateFieldValues(values, update)
	}

	return values
}

/** Adds one exact update expression without conflating sibling bulk items. */
const appendUpdateFieldValues = (
	values: Map<string, unknown>,
	update: unknown,
): void => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return
	}

	for (const fieldOperation of update.operations) {
		if (
			isPlainRecord(fieldOperation) &&
			typeof fieldOperation.field === 'string'
		) {
			values.set(fieldOperation.field, fieldOperation.value)
		}
	}
}

export const readAccessExpressionUpdateFieldValues = (
	update: unknown,
): ReadonlyMap<string, unknown> => {
	const values = new Map<string, unknown>()

	appendUpdateFieldValues(values, update)

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

interface AffectedFieldValuePair {
	readonly field: FieldAccessPlan
	readonly originalValue: unknown
	readonly value: unknown
}

type RecordFieldValue = ReturnType<typeof collectRecordFieldValues>[number]

/** Correlates concrete nested values, including removed list items, by path. */
const collectAffectedFieldValuePairs = (
	schemaPlan: SchemaAccessPlan,
	originalValues: readonly RecordFieldValue[],
	values: readonly RecordFieldValue[],
	rootFieldName: string,
): readonly AffectedFieldValuePair[] => {
	const pairs: AffectedFieldValuePair[] = []

	for (const field of schemaPlan.fields) {
		if (field.path[0] !== rootFieldName || field.field.kind === 'relation') {
			continue
		}

		const originalByPath = new Map(
			originalValues
				.filter(({ fieldPath }) => accessFieldPathsEqual(fieldPath, field.path))
				.map((entry) => [JSON.stringify(entry.valuePath), entry] as const),
		)
		const valueByPath = new Map(
			values
				.filter(({ fieldPath }) => accessFieldPathsEqual(fieldPath, field.path))
				.map((entry) => [JSON.stringify(entry.valuePath), entry] as const),
		)
		const valuePaths = new Set([
			...originalByPath.keys(),
			...valueByPath.keys(),
		])

		for (const valuePath of valuePaths) {
			pairs.push(
				immutableRecord({
					field,
					originalValue: originalByPath.get(valuePath)?.value ?? null,
					value: valueByPath.get(valuePath)?.value ?? null,
				}),
			)
		}
	}

	return immutableArray(pairs)
}

/** Evaluates callback transitions after a locked target yields final values. */
export const evaluateAccessPreparedUpdateFieldRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
	defaultFieldDecision: boolean,
	originalItem: Readonly<Record<string, unknown>>,
	item: Readonly<Record<string, unknown>>,
	updateFields?: ReadonlyMap<string, unknown>,
): Promise<void> => {
	// Structural validation establishes the executable closed operation union.
	const operation = request.operation as unknown as ExecutableOperationAst
	const originalValues = collectRecordFieldValues(
		schemaPlan.schema.fields,
		originalItem,
		'parent-first',
	)
	const values = collectRecordFieldValues(
		schemaPlan.schema.fields,
		item,
		'parent-first',
	)

	for (const [fieldName] of updateFields ?? readUpdateFieldValues(operation)) {
		for (const {
			field,
			originalValue,
			value,
		} of collectAffectedFieldValuePairs(
			schemaPlan,
			originalValues,
			values,
			fieldName,
		)) {
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
			plan.defaults.field,
		)
	}
}

export const evaluateAccessRelationWriteRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	updateFields: ReadonlyMap<string, unknown>,
): Promise<void> => {
	for (const [fieldName, change] of updateFields) {
		const fields = schemaPlan.fields.filter(({ path }) => path[0] === fieldName)

		for (const field of fields) {
			if (field.field.kind !== 'relation') continue

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
				field.relationWrite.length === 0 ? plan.defaults.field : true,
			)
		}
	}
}

/** Returns one static decision only when every transition agrees. */
export const readAccessStaticWriteDecision = (
	field: FieldAccessPlan,
): boolean | undefined => {
	const decisions: boolean[] = []

	for (const transition of ['fill', 'replace', 'clear'] as const) {
		const rules = field.write[transition]

		if (rules.some(({ rule }) => typeof rule === 'function')) {
			return undefined
		}

		decisions.push(!rules.some(({ rule }) => rule === false))
	}

	const [decision] = decisions

	return decision !== undefined &&
		decisions.every((value) => value === decision)
		? decision
		: undefined
}

/** Owns early field references, static writes, create fills, and relations. */
export const evaluateAccessMutationFieldRules = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	// Structural validation establishes the executable closed operation union.
	const operation = request.operation as unknown as ExecutableOperationAst
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

	if (operation.kind === 'upsert-one' || operation.kind === 'upsert-many') {
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

		if (Object.values(field.write).every((rules) => rules.length === 0)) {
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
				plan.defaults.field,
			)
			continue
		}

		const staticDecision = readAccessStaticWriteDecision(field)

		if (staticDecision === false) {
			await assertAccessDecisionRules(
				runtime,
				request,
				Object.values(field.write).flat(),
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
		plan,
		schemaPlan,
		readUpdateFieldValues(operation),
	)
}

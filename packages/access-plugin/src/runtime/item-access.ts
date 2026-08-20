import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	ExecutableOperationAst,
	OperationKind,
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
} from '@ultimabase/core'
import {
	collectOperationFieldInputs,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from '@ultimabase/core'
import type { AccessPlan, SchemaAccessPlan } from '../authoring/plan.js'
import { immutableRecord } from '@ultimabase/shared'
import type { AccessExecutionRuntime } from './execution-runtime.js'
import {
	createAccessUpdateCandidate,
	evaluateAccessCreateFillRules,
	evaluateAccessPreparedUpdateFieldRules,
	evaluateAccessRelationWriteRules,
	readAccessExpressionUpdateFieldValues,
	readAccessStaticWriteDecision,
} from './mutation-transitions.js'
import {
	assertAccessDecisionRules,
	readAccessSchema,
} from './rule-evaluation.js'

const operationItemFamily = (
	kind: OperationKind,
): keyof SchemaAccessPlan['item'] | undefined => {
	switch (kind) {
		case 'create-many':
		case 'create-one':
			return 'create'
		case 'update-many':
		case 'update-one':
			return 'update'
		case 'upsert-many':
		case 'upsert-one':
			return 'upsert'
		case 'delete-many':
		case 'delete-one':
			return 'delete'
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return undefined
	}
}

/** Evaluates create candidates and direct item denials before preparation. */
export const evaluateAccessCreateItems = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	// Structural validation establishes the executable closed operation union.
	const operation = request.operation as unknown as ExecutableOperationAst
	const family = operationItemFamily(operation.kind)

	if (family === undefined) {
		return
	}

	const rules = schemaPlan.item[family]

	if (operation.kind !== 'create-one' && operation.kind !== 'create-many') {
		const directRules = rules.filter(({ rule }) => typeof rule === 'boolean')
		await assertAccessDecisionRules(
			runtime,
			request,
			directRules,
			{
				branch: family,
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			immutableRecord({ context: request.context }),
			true,
		)
		return
	}

	const inputs =
		operation.kind === 'create-one' ? [operation.input] : operation.inputs

	for (const input of inputs) {
		const item = materializePreparedSchemaDraft(schemaPlan.schema, input)

		await assertAccessDecisionRules(
			runtime,
			request,
			rules,
			{
				branch: 'create',
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				item,
			}),
			true,
		)
	}
}

/** Requests set preimages only when item values or dynamic transitions need them. */
export const requiresAccessPreparedMutationItems = (
	plan: AccessPlan,
	operation: DatabaseMutationOperationAst,
): boolean => {
	if (operation.kind !== 'update-many' && operation.kind !== 'delete-many') {
		return false
	}

	const schemaPlan = plan.getSchema(readAccessSchema(operation))

	if (schemaPlan === undefined) {
		throw new TypeError('Native Access plan does not own the operation schema')
	}

	if (operation.kind === 'delete-many') {
		return schemaPlan.item.delete.length > 0
	}

	if (schemaPlan.item.update.length > 0) {
		return true
	}

	return collectOperationFieldInputs(operation, 'parent-first').some(
		(input) => {
			if (input.mode !== 'update' || input.field.kind === 'relation') {
				return false
			}

			const field = plan.getField(schemaPlan.schema, input.fieldPath)

			return (
				field?.field === input.field &&
				readAccessStaticWriteDecision(field) === undefined
			)
		},
	)
}

/** Owns prepared target item decisions and final field-value transitions. */
export const enforceAccessPreparedMutation = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	runtime: AccessExecutionRuntime,
	plan: AccessPlan,
	request: RuntimePreparedMutationStageInput<TOperation>,
): Promise<void> => {
	const setBased =
		request.operation.kind === 'update-many' ||
		request.operation.kind === 'delete-many'

	if (
		(request.target === undefined &&
			(!setBased || request.targets === undefined)) ||
		(request.operation.kind !== 'update-one' &&
			request.operation.kind !== 'update-many' &&
			request.operation.kind !== 'delete-one' &&
			request.operation.kind !== 'delete-many' &&
			request.operation.kind !== 'upsert-one')
	) {
		return
	}
	if (request.target === null && request.operation.kind !== 'upsert-one') {
		return
	}

	const schemaPlan = plan.getSchema(readAccessSchema(request.operation))

	if (schemaPlan === undefined) {
		throw new TypeError('Native Access plan does not own the operation schema')
	}

	// The mutation discriminants above establish the executable operation subset.
	const operation = request.operation as unknown as ExecutableOperationAst

	if (
		(operation.kind === 'update-many' || operation.kind === 'delete-many') &&
		request.targets !== undefined
	) {
		for (const target of request.targets) {
			const originalItem = materializeSchemaModel(schemaPlan.schema, target)

			if (operation.kind === 'delete-many') {
				await assertAccessDecisionRules(
					runtime,
					request,
					schemaPlan.item.delete,
					{
						branch: 'delete',
						phase: 'access-item',
						schema: schemaPlan.schema,
					},
					immutableRecord({ context: request.context, originalItem }),
					true,
				)
				continue
			}

			const candidate = createAccessUpdateCandidate(
				schemaPlan.schema,
				operation.update,
				target,
			)

			await evaluateAccessPreparedUpdateFieldRules(
				runtime,
				request,
				schemaPlan,
				plan.defaults.field,
				target,
				candidate,
			)
			await assertAccessDecisionRules(
				runtime,
				request,
				schemaPlan.item.update,
				{
					branch: 'update',
					phase: 'access-item',
					schema: schemaPlan.schema,
				},
				immutableRecord({
					context: request.context,
					item: candidate,
					originalItem,
				}),
				true,
			)
		}

		return
	}

	if (request.target === undefined) {
		throw new TypeError(
			'Native Access singular mutation requires a prepared target',
		)
	}

	const family =
		request.operation.kind === 'update-one'
			? 'update'
			: request.operation.kind === 'delete-one'
				? 'delete'
				: 'upsert'
	const upsertUpdate = family === 'upsert' && request.target !== null
	let item: object | null
	let originalItem: object | null

	if (request.target === null) {
		if (operation.kind !== 'upsert-one') {
			throw new TypeError(
				'Native Access missing target is valid only for an upsert create branch',
			)
		}

		item = materializePreparedSchemaDraft(schemaPlan.schema, operation.create)
		originalItem = null
		await evaluateAccessCreateFillRules(
			runtime,
			request,
			plan,
			schemaPlan,
			collectOperationFieldInputs(request.operation, 'parent-first').filter(
				(input) => input.mode === 'create',
			),
		)
	} else {
		originalItem = materializeSchemaModel(schemaPlan.schema, request.target)

		if (operation.kind === 'delete-one') {
			item = null
		} else if (
			operation.kind === 'update-one' ||
			operation.kind === 'upsert-one'
		) {
			const candidate = createAccessUpdateCandidate(
				schemaPlan.schema,
				operation.update,
				request.target,
			)
			item = candidate
			if (operation.kind === 'upsert-one') {
				await evaluateAccessRelationWriteRules(
					runtime,
					request,
					plan,
					schemaPlan,
					readAccessExpressionUpdateFieldValues(operation.update),
				)
			}
			await evaluateAccessPreparedUpdateFieldRules(
				runtime,
				request,
				schemaPlan,
				plan.defaults.field,
				request.target,
				candidate,
			)
		} else {
			throw new TypeError('Native Access received an invalid prepared mutation')
		}
	}

	await assertAccessDecisionRules(
		runtime,
		request,
		schemaPlan.item[family],
		{
			branch: family,
			phase: 'access-item',
			schema: schemaPlan.schema,
		},
		family === 'delete'
			? immutableRecord({ context: request.context, originalItem })
			: immutableRecord({
					context: request.context,
					item,
					originalItem,
					...(family === 'upsert'
						? {
								mode: upsertUpdate ? ('update' as const) : ('create' as const),
							}
						: {}),
				}),
		true,
	)
}

type UpsertMaterialization =
	| Readonly<{
			kind: 'create'
			current: Readonly<Record<string, unknown>>
	  }>
	| Readonly<{
			kind: 'update'
			current: Readonly<Record<string, unknown>>
			previous: Readonly<Record<string, unknown>>
	  }>

/** Validates the database-selected upsert branch against item and field rules. */
export const enforceAccessMutationOutcome = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	runtime: AccessExecutionRuntime,
	plan: AccessPlan,
	request: RuntimeMutationOutcomeStageInput<TOperation>,
): Promise<DatabaseOperationOutcome<TOperation>> => {
	if (
		request.operation.kind !== 'upsert-one' &&
		request.operation.kind !== 'upsert-many'
	) {
		return request.outcome
	}

	const schemaPlan = plan.getSchema(readAccessSchema(request.operation))

	if (schemaPlan === undefined) {
		throw new TypeError('Native Access plan does not own the operation schema')
	}

	// The checked terminal narrows the private operation shape and materializations.
	const operation = request.operation as unknown as ExecutableOperationAst
	if (operation.kind !== 'upsert-one' && operation.kind !== 'upsert-many') {
		throw new TypeError('Native Access requires an upsert operation')
	}
	const items = operation.kind === 'upsert-one' ? [operation] : operation.items
	const fieldInputs = collectOperationFieldInputs(
		request.operation,
		'parent-first',
	)
	const materializations = request.outcome
		.materializations as unknown as readonly UpsertMaterialization[]

	for (const [index, materialization] of materializations.entries()) {
		const item = items[index]

		if (item === undefined) {
			throw new TypeError('Native Access received an unmatched upsert outcome')
		}

		const update = materialization.kind === 'update'
		const accessItem = update
			? materialization.current
			: materializePreparedSchemaDraft(
					schemaPlan.schema,
					materialization.current,
				)
		const originalItem = update
			? materializeSchemaModel(schemaPlan.schema, materialization.previous)
			: null

		if (update) {
			await evaluateAccessRelationWriteRules(
				runtime,
				request,
				plan,
				schemaPlan,
				readAccessExpressionUpdateFieldValues(item.update),
			)
			await evaluateAccessPreparedUpdateFieldRules(
				runtime,
				request,
				schemaPlan,
				plan.defaults.field,
				materialization.previous,
				materialization.current,
				readAccessExpressionUpdateFieldValues(item.update),
			)
		} else {
			await evaluateAccessCreateFillRules(
				runtime,
				request,
				plan,
				schemaPlan,
				fieldInputs.filter(
					(input) => input.mode === 'create' && input.itemIndex === index,
				),
			)
		}
		await assertAccessDecisionRules(
			runtime,
			request,
			schemaPlan.item.upsert,
			{
				branch: 'upsert',
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				item: accessItem,
				mode: update ? ('update' as const) : ('create' as const),
				originalItem,
			}),
			true,
		)
	}

	return request.outcome
}

import {
	collectOperationFieldInputs,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterializationSource,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type ExecutableOperationAst,
	type RuntimeMutationOutcomeStageInput,
	type RuntimeOperationStageInput,
	type RuntimePreparedMutationStageInput,
} from '@ultimabase/core'
import {
	allowUndeclaredFieldAccess,
	readAccessOperationFamily,
	type AccessPlan,
	type CompiledAccessRule,
	type SchemaAccessPlan,
} from '../authoring/plan.js'
import { immutableRecord } from '@ultimabase/shared'
import type { AccessExecutionRuntime } from './execution-runtime.js'
import {
	createAccessUpdateCandidate,
	collectUpdateFieldValues,
	evaluateAccessCreateFillRules,
	evaluateAccessPreparedUpdateFieldRules,
	evaluateAccessRelationWriteRules,
	readAccessStaticWriteDecision,
} from './mutation-transitions.js'
import {
	assertAccessDecisionRules,
	requireAccessSchemaPlan,
} from './rule-evaluation.js'

/** Applies one item branch with its canonical Runtime identity. */
const assertAccessItemRules = (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
	branch: keyof SchemaAccessPlan['item'],
	input: Readonly<Record<string, unknown>>,
	rules: readonly CompiledAccessRule[] = schemaPlan.item[branch],
): Promise<void> =>
	assertAccessDecisionRules(
		runtime,
		request,
		rules,
		{
			branch,
			phase: 'access-item',
			schema: schemaPlan.schema,
		},
		input,
		true,
	)

/** Evaluates create candidates and direct item denials before preparation. */
export const evaluateAccessCreateItems = async (
	runtime: AccessExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	// Structural validation establishes the executable closed operation union.
	const operation = request.operation as unknown as ExecutableOperationAst
	const family = readAccessOperationFamily(operation.kind)

	if (family === 'read') return

	if (operation.kind !== 'create-one' && operation.kind !== 'create-many') {
		const directRules = schemaPlan.item[family].filter(
			({ rule }) => typeof rule === 'boolean',
		)
		await assertAccessItemRules(
			runtime,
			request,
			schemaPlan,
			family,
			immutableRecord({ context: request.context }),
			directRules,
		)
		return
	}

	const inputs =
		operation.kind === 'create-one' ? [operation.input] : operation.inputs

	for (const input of inputs) {
		const item = materializePreparedSchemaDraft(schemaPlan.schema, input)

		await assertAccessItemRules(
			runtime,
			request,
			schemaPlan,
			'create',
			immutableRecord({
				context: request.context,
				item,
			}),
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

	const schemaPlan = requireAccessSchemaPlan(plan, operation)

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
export const enforceAccessPreparedMutation = async (
	runtime: AccessExecutionRuntime,
	plan: AccessPlan,
	request: RuntimePreparedMutationStageInput<
		DatabaseMutationOperationAst,
		DatabaseLogicalRecord
	>,
): Promise<void> => {
	const setBased =
		request.operation.kind === 'update-many' ||
		request.operation.kind === 'delete-many'
	const family = readAccessOperationFamily(request.operation.kind)

	if (
		(request.target === undefined &&
			(!setBased || request.targets === undefined)) ||
		family === 'create' ||
		family === 'read' ||
		request.operation.kind === 'upsert-many'
	) {
		return
	}
	if (request.target === null && request.operation.kind !== 'upsert-one') {
		return
	}

	const schemaPlan = requireAccessSchemaPlan(plan, request.operation)

	// The mutation discriminants above establish the executable operation subset.
	const operation = request.operation as unknown as ExecutableOperationAst
	const fieldInputs = collectOperationFieldInputs(operation, 'parent-first')
	const updateFields = collectUpdateFieldValues(fieldInputs)

	if (
		(operation.kind === 'update-many' || operation.kind === 'delete-many') &&
		request.targets !== undefined
	) {
		for (const target of request.targets) {
			const originalItem = materializeSchemaModel(schemaPlan.schema, target)

			if (operation.kind === 'delete-many') {
				await assertAccessItemRules(
					runtime,
					request,
					schemaPlan,
					'delete',
					immutableRecord({ context: request.context, originalItem }),
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
				allowUndeclaredFieldAccess,
				target,
				candidate,
				updateFields,
			)
			await assertAccessItemRules(
				runtime,
				request,
				schemaPlan,
				'update',
				immutableRecord({
					context: request.context,
					item: candidate,
					originalItem,
				}),
			)
		}

		return
	}

	if (request.target === undefined) {
		throw new TypeError(
			'Native Access singular mutation requires a prepared target',
		)
	}

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
			fieldInputs.filter((input) => input.mode === 'create'),
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
					schemaPlan,
					updateFields,
				)
			}
			await evaluateAccessPreparedUpdateFieldRules(
				runtime,
				request,
				schemaPlan,
				allowUndeclaredFieldAccess,
				request.target,
				candidate,
				updateFields,
			)
		} else {
			throw new TypeError('Native Access received an invalid prepared mutation')
		}
	}

	await assertAccessItemRules(
		runtime,
		request,
		schemaPlan,
		family,
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
	)
}

/** Validates the database-selected upsert branch against item and field rules. */
export const enforceAccessMutationOutcome = async (
	runtime: AccessExecutionRuntime,
	plan: AccessPlan,
	request: RuntimeMutationOutcomeStageInput<
		DatabaseMutationOperationAst,
		DatabaseMutationMaterializationSource
	>,
): Promise<void> => {
	if (
		request.operation.kind !== 'upsert-one' &&
		request.operation.kind !== 'upsert-many'
	) {
		return
	}

	const schemaPlan = requireAccessSchemaPlan(plan, request.operation)

	// The checked terminal narrows the private operation shape and materializations.
	const operation = request.operation as unknown as Extract<
		ExecutableOperationAst,
		{ readonly kind: 'upsert-many' | 'upsert-one' }
	>
	const items = operation.kind === 'upsert-one' ? [operation] : operation.items
	const fieldInputs = collectOperationFieldInputs(operation, 'parent-first')
	for (const [
		index,
		materialization,
	] of request.outcome.materializations.entries()) {
		if (materialization.kind === 'delete') {
			throw new TypeError(
				'Native Access received an invalid upsert materialization',
			)
		}
		if (items[index] === undefined) {
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
			const updateFields = collectUpdateFieldValues(fieldInputs, index)

			await evaluateAccessRelationWriteRules(
				runtime,
				request,
				schemaPlan,
				updateFields,
			)
			await evaluateAccessPreparedUpdateFieldRules(
				runtime,
				request,
				schemaPlan,
				allowUndeclaredFieldAccess,
				materialization.previous,
				materialization.current,
				updateFields,
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
		await assertAccessItemRules(
			runtime,
			request,
			schemaPlan,
			'upsert',
			immutableRecord({
				context: request.context,
				item: accessItem,
				mode: update ? ('update' as const) : ('create' as const),
				originalItem,
			}),
		)
	}
}

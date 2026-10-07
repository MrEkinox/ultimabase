import {
	collectOperationFieldInputs,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
	type DatabaseMutationMaterializationSource,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type ExecutableOperationAst,
	type RequestContext,
	type RuntimePreparedMutationRecords,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { SchemaItemAccessFamily } from '../authoring/declarations.js'
import {
	readAccessOperationFamily,
	type AccessPlan,
	type CompiledAccessRule,
} from '../authoring/plan.js'
import type { AccessExecutionRuntime } from './execution-runtime.js'
import {
	collectUpdateFieldValues,
	createAccessUpdateCandidate,
	evaluateAccessCreateFillRules,
	evaluateAccessPreparedUpdateFieldRules,
	evaluateAccessRelationWriteRules,
	readAccessStaticWriteDecision,
} from './mutation-transitions.js'
import {
	assertAccessRules,
	createAccessScope,
	readExecutableOperation,
	requireAccessSchemaPlan,
	type AccessScope,
} from './rule-evaluation.js'

/** Applies one item branch with its canonical Runtime identity. */
const assertItemRules = (
	scope: AccessScope,
	branch: SchemaItemAccessFamily,
	input: Readonly<Record<string, unknown>>,
	rules: readonly CompiledAccessRule[] = scope.schemaPlan.item[branch],
): Promise<void> =>
	assertAccessRules(scope, rules, { branch, phase: 'access-item' }, input)

/** Evaluates create candidates and static item denials before preparation. */
export const evaluateAccessCreateItems = async (
	scope: AccessScope,
	operation: DatabaseOperationAst,
): Promise<void> => {
	const executable = readExecutableOperation(operation)
	const family = readAccessOperationFamily(executable.kind)
	if (family === 'read') return

	if (executable.kind !== 'create-one' && executable.kind !== 'create-many') {
		// Only static item decisions can run before a target is prepared.
		await assertItemRules(
			scope,
			family,
			immutableRecord({ context: scope.context }),
			scope.schemaPlan.item[family].filter(
				({ rule }) => typeof rule === 'boolean',
			),
		)
		return
	}

	const inputs =
		executable.kind === 'create-one' ? [executable.input] : executable.inputs
	for (const input of inputs) {
		await assertItemRules(
			scope,
			'create',
			immutableRecord({
				context: scope.context,
				item: materializePreparedSchemaDraft(scope.schema, input),
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
	if (schemaPlan.item.update.length > 0) return true

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
	context: RequestContext,
	operation: DatabaseMutationOperationAst,
	{ target, targets }: RuntimePreparedMutationRecords,
): Promise<void> => {
	const kind = operation.kind
	const setBased = kind === 'update-many' || kind === 'delete-many'
	const family = readAccessOperationFamily(kind)
	if (
		(target === undefined && (!setBased || targets === undefined)) ||
		family === 'create' ||
		family === 'read' ||
		kind === 'upsert-many'
	) {
		return
	}
	if (target === null && kind !== 'upsert-one') return

	const scope = createAccessScope(runtime, plan, context, operation)
	const { schema } = scope
	const executable = readExecutableOperation(operation)
	const fieldInputs = collectOperationFieldInputs(executable, 'parent-first')
	const updateFields = collectUpdateFieldValues(fieldInputs)

	if (
		(executable.kind === 'update-many' || executable.kind === 'delete-many') &&
		targets !== undefined
	) {
		for (const current of targets) {
			const originalItem = materializeSchemaModel(schema, current)
			if (executable.kind === 'delete-many') {
				await assertItemRules(
					scope,
					'delete',
					immutableRecord({ context, originalItem }),
				)
				continue
			}
			const candidate = createAccessUpdateCandidate(
				schema,
				executable.update,
				current,
			)
			await evaluateAccessPreparedUpdateFieldRules(
				scope,
				current,
				candidate,
				updateFields,
			)
			await assertItemRules(
				scope,
				'update',
				immutableRecord({ context, item: candidate, originalItem }),
			)
		}
		return
	}

	if (target === undefined) {
		throw new TypeError(
			'Native Access singular mutation requires a prepared target',
		)
	}
	let item: object | null
	let originalItem: object | null
	if (target === null) {
		if (executable.kind !== 'upsert-one') {
			throw new TypeError(
				'Native Access missing target is valid only for an upsert create branch',
			)
		}
		item = materializePreparedSchemaDraft(schema, executable.create)
		originalItem = null
		await evaluateAccessCreateFillRules(
			scope,
			fieldInputs.filter((input) => input.mode === 'create'),
		)
	} else {
		originalItem = materializeSchemaModel(schema, target)
		if (executable.kind === 'delete-one') {
			item = null
		} else if (
			executable.kind === 'update-one' ||
			executable.kind === 'upsert-one'
		) {
			const candidate = createAccessUpdateCandidate(
				schema,
				executable.update,
				target,
			)
			item = candidate
			if (executable.kind === 'upsert-one') {
				await evaluateAccessRelationWriteRules(scope, updateFields)
			}
			await evaluateAccessPreparedUpdateFieldRules(
				scope,
				target,
				candidate,
				updateFields,
			)
		} else {
			throw new TypeError('Native Access received an invalid prepared mutation')
		}
	}

	await assertItemRules(
		scope,
		family,
		family === 'delete'
			? immutableRecord({ context, originalItem })
			: immutableRecord({
					context,
					item,
					originalItem,
					...(family === 'upsert'
						? {
								mode:
									target === null ? ('create' as const) : ('update' as const),
							}
						: {}),
				}),
	)
}

/** Validates the database-selected upsert branch against item and field rules. */
export const enforceAccessUpsertOutcome = async (
	scope: AccessScope,
	operation: Extract<
		ExecutableOperationAst,
		{ readonly kind: 'upsert-many' | 'upsert-one' }
	>,
	outcome: DatabaseMutationMaterializationSource,
): Promise<void> => {
	const { context, schema } = scope
	const items = operation.kind === 'upsert-one' ? [operation] : operation.items
	const fieldInputs = collectOperationFieldInputs(operation, 'parent-first')
	for (const [index, materialization] of outcome.materializations.entries()) {
		if (materialization.kind === 'delete') {
			throw new TypeError(
				'Native Access received an invalid upsert materialization',
			)
		}
		if (items[index] === undefined) {
			throw new TypeError('Native Access received an unmatched upsert outcome')
		}

		const update = materialization.kind === 'update'
		const item = update
			? materialization.current
			: materializePreparedSchemaDraft(schema, materialization.current)
		const originalItem = update
			? materializeSchemaModel(schema, materialization.previous)
			: null
		if (update) {
			const updateFields = collectUpdateFieldValues(fieldInputs, index)
			await evaluateAccessRelationWriteRules(scope, updateFields)
			await evaluateAccessPreparedUpdateFieldRules(
				scope,
				materialization.previous,
				materialization.current,
				updateFields,
			)
		} else {
			await evaluateAccessCreateFillRules(
				scope,
				fieldInputs.filter(
					(input) => input.mode === 'create' && input.itemIndex === index,
				),
			)
		}
		await assertItemRules(
			scope,
			'upsert',
			immutableRecord({
				context,
				item,
				mode: update ? ('update' as const) : ('create' as const),
				originalItem,
			}),
		)
	}
}

import {
	createRuntimeBehaviorBoundaries,
	getOperationSchema,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
	Schema,
	transformOperationFieldInputs,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterializationSource,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type RuntimeBehaviorStages,
	type RuntimeLogicalMutationOperationAst,
	type RuntimeLogicalOperationAst,
	type RuntimeNestedWriteStageContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { getHookHandlerEntries } from '../authoring/declarations.js'
import type { HookContext } from '../context/hook-context.js'
import type {
	HookContributionPlan,
	SchemaHookContributionPlan,
} from './contribution-plan.js'
import {
	collectHandlers,
	createInputFor,
	type PlannedHandler,
} from './planned-handlers.js'
import {
	createFieldHookTarget,
	createSchemaHookTarget,
	type HookExecutionRuntime,
} from './execution-runtime.js'
import {
	applyUpdateToTarget,
	collectMutationAfterItems,
	getHookOperationFamily,
	getMutationHookKind,
} from './lifecycle.js'
import {
	readUpdateChanges,
	requireData,
	writeUpdateChanges,
	type RelationChanges,
} from './readable-data.js'
import { createSchemaMutationHooks } from './schema-mutation-dispatch.js'
import type { RequestContext } from '@ultimabase/core/plugin'

const emptyRelationChanges: RelationChanges = immutableRecord({})

const readRelationChanges = (
	nestedWrite: RuntimeNestedWriteStageContext | undefined,
): RelationChanges =>
	nestedWrite?.readRelationChanges?.() ?? emptyRelationChanges

const requireDeclaredOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema = getOperationSchema(operation)
	if (!Schema.is(schema)) {
		throw new TypeError('Native hook dispatch requires a declared schema')
	}
	return schema
}

const isBulkMutation = (operation: DatabaseOperationAst): boolean =>
	operation.kind === 'create-many' ||
	operation.kind === 'update-many' ||
	operation.kind === 'upsert-many' ||
	operation.kind === 'delete-many'

const materialize = (
	schema: SchemaDefinition,
	record: DatabaseLogicalRecord | null,
): object | null =>
	record === null ? null : materializeSchemaModel(schema, record)

/** Compiles official declarations into Core's generic behavior boundaries. */
export const createHookBehavior = (
	plan: HookContributionPlan,
	runtime: HookExecutionRuntime,
): RuntimeBehaviorStages => {
	const boundaries = createRuntimeBehaviorBoundaries()

	/** Invokes one erased callback through the single application-owned safety boundary. */
	const invokeHook = (
		handler: PlannedHandler,
		request: RequestContext,
		createInput: (context: HookContext) => unknown,
	): Promise<unknown> =>
		runtime.invoke(handler.descriptor, request, (context) =>
			// Each declaration was type-checked against this exact input when authored.
			handler.descriptor.handler(createInput(context) as never),
		)

	/** Executes effects sequentially so declaration order stays observable. */
	const runEffects = async (
		handlers: readonly PlannedHandler[],
		request: RequestContext,
		createInput: (handler: PlannedHandler, context: HookContext) => unknown,
	): Promise<void> => {
		for (const handler of handlers) {
			await invokeHook(handler, request, (context) =>
				createInput(handler, context),
			)
		}
	}

	const requireSchemaPlan = (
		operation: DatabaseOperationAst,
	): SchemaHookContributionPlan => {
		const schemaPlan = plan.getSchema(requireDeclaredOperationSchema(operation))
		if (schemaPlan === undefined) {
			throw new TypeError('Native hook plan does not own the operation schema')
		}
		return schemaPlan
	}

	const schemaHandlers = (
		schemaPlan: SchemaHookContributionPlan,
		order: 'after' | 'before',
		phase:
			'afterCommit' | 'afterOperation' | 'beforeOperation' | 'resolveInput',
		operation: DatabaseOperationAst,
	): readonly PlannedHandler[] =>
		collectHandlers(
			schemaPlan.contributions[order],
			(declarations) =>
				getHookHandlerEntries(
					declarations,
					phase,
					getHookOperationFamily(operation.kind),
				),
			{
				operationKind: operation.kind,
				phase,
				target: createSchemaHookTarget(schemaPlan.schema.className),
			},
		)

	/** Resolves present non-null field values with family-composed handlers. */
	const resolveFieldInputs = async <
		const TOperation extends DatabaseOperationAst,
	>(
		request: RequestContext,
		operation: TOperation,
	): Promise<TOperation> => {
		const family = getHookOperationFamily(operation.kind)
		// Reads and deletes have no input to resolve; preserve their original operation.
		if (family === 'delete' || family === 'read') return operation
		const schema = requireDeclaredOperationSchema(operation)
		if (isBulkMutation(operation)) return operation

		return transformOperationFieldInputs(operation, async (fieldInput) => {
			// Field hooks run only for a non-null value; `null` is stored as is.
			if (fieldInput.value === null) return undefined
			const fieldPlan = plan.getField(schema, fieldInput.fieldPath)
			if (fieldPlan === undefined) return undefined
			const handlers = collectHandlers(
				fieldPlan.contributions.before,
				(declarations) =>
					getHookHandlerEntries(declarations, 'resolveInput', family),
				{
					operationKind: operation.kind,
					phase: 'resolveInput',
					target: createFieldHookTarget(schema.className, fieldInput.fieldPath),
				},
			)

			let value: unknown = fieldInput.value
			for (const handler of handlers) {
				const replacement = await invokeHook(handler, request, (context) =>
					immutableRecord({
						context,
						kind: getMutationHookKind(operation.kind),
						mode: fieldInput.mode,
						value,
					}),
				)
				// Only undefined keeps the current value; null is a real replacement.
				if (replacement !== undefined) value = replacement
			}
			return value === fieldInput.value ? undefined : value
		})
	}

	/**
	 * Runs schema `resolveInput` on plain data once the visible target is
	 * prepared and locked, then translates the result back into the operation.
	 */
	const resolveSchemaInput = async <
		const TOperation extends DatabaseMutationOperationAst,
	>(
		request: RequestContext,
		operation: TOperation,
		target: DatabaseLogicalRecord | null | undefined,
		nestedWrite: RuntimeNestedWriteStageContext | undefined,
	): Promise<TOperation> => {
		const { kind } = operation
		if (kind === 'delete-one' || kind === 'delete-many') return operation
		if (kind === 'update-one' && target === null) return operation

		const schemaPlan = requireSchemaPlan(operation)
		// Deletes returned above, so only itemized saves remain valid here.
		if (isBulkMutation(operation)) {
			throw new TypeError(
				'Schema resolveInput requires itemized mutation operations',
			)
		}
		const handlers = schemaHandlers(
			schemaPlan,
			'before',
			'resolveInput',
			operation,
		)
		if (handlers.length === 0) return operation

		const { schema } = schemaPlan
		const relations = readRelationChanges(nestedWrite)
		// Core normalizes every save to its executable record shape.
		const record = operation as unknown as Readonly<Record<string, unknown>>
		const internals = immutableRecord({
			operation,
			...(nestedWrite === undefined ? {} : { nestedWrite: nestedWrite.graph }),
		})
		const originalItem =
			kind === 'create-one' || target === null || target === undefined
				? null
				: materializeSchemaModel(schema, target)
		const mode =
			kind === 'create-one' || originalItem === null ? 'create' : 'update'
		let data: unknown = record.input ?? record.create
		let changes: unknown =
			kind === 'create-one'
				? undefined
				: readUpdateChanges(record.update, relations)
		const initial = { changes, data }

		for (const handler of handlers) {
			const path = `${schema.className}.hooks.resolveInput`
			const replacement = await invokeHook(handler, request, (context) =>
				createInputFor(
					handler,
					schema,
					internals,
					kind === 'create-one'
						? { context, kind: 'create', data }
						: kind === 'update-one'
							? { context, kind: 'update', changes, originalItem }
							: { context, kind: 'upsert', mode, data, changes, originalItem },
				),
			)
			if (replacement === undefined) continue
			requireData(replacement, path)
			if (kind === 'create-one') data = replacement
			else if (kind === 'update-one') changes = replacement
			else {
				const pair = replacement as Readonly<Record<string, unknown>>
				requireData(pair.data, `${path} upsert data`)
				requireData(pair.changes, `${path} upsert changes`)
				data = pair.data
				changes = pair.changes
			}
		}

		if (data === initial.data && changes === initial.changes) return operation
		const update =
			changes === initial.changes
				? record.update
				: writeUpdateChanges(
						schema,
						record.update,
						changes,
						relations,
						`${schema.className}.hooks.resolveInput`,
					)
		return boundaries.snapshotPreparedOperationReplacement(
			operation,
			kind === 'create-one'
				? { ...record, input: data }
				: kind === 'update-one'
					? { ...record, update }
					: { ...record, create: data, update },
		)
	}

	/** Runs `beforeOperation` once Runtime has prepared any reliable preimage. */
	const runPreparedPhases = async (
		request: RequestContext,
		operation: DatabaseMutationOperationAst,
		target: DatabaseLogicalRecord | null | undefined,
		nestedWrite: RuntimeNestedWriteStageContext | undefined,
	): Promise<void> => {
		if (isBulkMutation(operation)) return
		if (
			(operation.kind === 'update-one' || operation.kind === 'delete-one') &&
			(target === null || target === undefined)
		) {
			return
		}

		const schemaPlan = requireSchemaPlan(operation)
		const handlers = schemaHandlers(
			schemaPlan,
			'before',
			'beforeOperation',
			operation,
		)
		if (handlers.length === 0) return

		const { schema } = schemaPlan
		const record = operation as unknown as Readonly<Record<string, unknown>>
		const internals = immutableRecord({
			operation,
			...(nestedWrite === undefined ? {} : { nestedWrite: nestedWrite.graph }),
		})
		const current = target ?? null
		const originalItem = materialize(schema, current)
		let base: Readonly<Record<string, unknown>>
		switch (operation.kind) {
			case 'create-one':
				base = {
					kind: 'create',
					item: materializePreparedSchemaDraft(schema, record.input),
				}
				break
			case 'update-one':
				base = {
					kind: 'update',
					item: immutableRecord(
						applyUpdateToTarget(schema, current ?? {}, record.update),
					),
					originalItem,
					changes: readUpdateChanges(
						record.update,
						readRelationChanges(nestedWrite),
					),
				}
				break
			case 'upsert-one':
				base = {
					kind: 'upsert',
					mode: current === null ? 'create' : 'update',
					item:
						current === null
							? materializePreparedSchemaDraft(schema, record.create)
							: immutableRecord(
									applyUpdateToTarget(schema, current, record.update),
								),
					originalItem,
				}
				break
			default:
				base = { kind: 'delete', item: null, originalItem }
		}

		await runEffects(handlers, request, (handler, context) =>
			createInputFor(handler, schema, internals, { ...base, context }),
		)
	}

	/** Runs `afterOperation`, then queues `afterCommit`, over persisted pairs. */
	const runResultPhases = async <TResult>(
		request: RequestContext,
		operation: DatabaseOperationAst,
		result: TResult,
		outcome: DatabaseMutationMaterializationSource | undefined,
		selectedFieldsOverride: readonly string[] | undefined,
		nestedWrite: RuntimeNestedWriteStageContext | undefined,
	): Promise<TResult> => {
		const schemaPlan = requireSchemaPlan(operation)
		const family = getHookOperationFamily(operation.kind)
		// The boundary preserves the exact generic result while restoring metadata.
		const snapshot = boundaries.snapshotResultReplacement(
			operation,
			result,
			selectedFieldsOverride,
		) as TResult

		if (family === 'read' || isBulkMutation(operation)) return snapshot
		if (outcome === undefined) {
			throw new TypeError(
				'Schema mutation after-hooks require private materializations',
			)
		}

		const afterHandlers = schemaHandlers(
			schemaPlan,
			'after',
			'afterOperation',
			operation,
		)
		// After commit runs global, then `all`, then the operation's own branch.
		const commitHandlers = schemaHandlers(
			schemaPlan,
			'before',
			'afterCommit',
			operation,
		)
		if (afterHandlers.length === 0 && commitHandlers.length === 0) {
			return snapshot
		}

		const { schema } = schemaPlan
		const record = operation as unknown as Readonly<Record<string, unknown>>
		const internals = immutableRecord({
			operation,
			...(nestedWrite === undefined ? {} : { nestedWrite: nestedWrite.graph }),
		})
		const changes =
			family === 'update'
				? readUpdateChanges(record.update, readRelationChanges(nestedWrite))
				: undefined
		const afterCommitScope =
			commitHandlers.length === 0
				? undefined
				: await runtime.captureAfterCommitScope(request)

		for (const pair of collectMutationAfterItems(outcome)) {
			const originalItem = materialize(schema, pair.originalItem)
			const item = materialize(schema, pair.item)
			const base: Readonly<Record<string, unknown>> =
				family === 'create'
					? { kind: 'create', item, originalItem: null }
					: family === 'update'
						? { kind: 'update', item, originalItem, changes }
						: family === 'upsert'
							? {
									kind: 'upsert',
									mode: originalItem === null ? 'create' : 'update',
									item,
									originalItem,
								}
							: { kind: 'delete', item: null, originalItem }
			await runEffects(afterHandlers, request, (handler, context) =>
				createInputFor(handler, schema, internals, { ...base, context }),
			)
			if (afterCommitScope !== undefined) {
				runtime.queueAfterCommit(
					commitHandlers,
					afterCommitScope,
					(handler, context) =>
						createInputFor(handler, schema, internals, { ...base, context }),
				)
			}
		}

		return snapshot
	}

	const schemaMutationHooks = createSchemaMutationHooks(plan, runtime)

	return immutableRecord({
		beforeOperation: (input) => {
			const operation: RuntimeLogicalOperationAst = input.operation
			if (operation.kind !== 'plugin-schema-mutation') return undefined
			return schemaMutationHooks.before(input.context, operation)
		},
		transformMutationOutcome: (input) => {
			const operation: RuntimeLogicalMutationOperationAst = input.operation
			if (operation.kind === 'plugin-schema-mutation') return input.outcome
			// Validation proves that the snapshot retains this transform's exact value type.
			return boundaries.snapshotMutationOutcome(
				operation,
				input.outcome,
				input.selectedFieldsOverride,
			) as typeof input.outcome
		},
		transformInput: (input) =>
			resolveFieldInputs(input.context, input.operation),
		transformResult: async (input) => {
			const operation: RuntimeLogicalOperationAst = input.operation
			if (operation.kind !== 'plugin-schema-mutation') {
				return runResultPhases(
					input.context,
					operation,
					input.result,
					input.outcome,
					input.selectedFieldsOverride,
					input.nestedWrite,
				)
			}
			await schemaMutationHooks.after(input.context, operation, input.outcome)
			return input.result
		},
		observePreparedMutation: (input) => {
			const operation: RuntimeLogicalMutationOperationAst = input.operation
			if (operation.kind === 'plugin-schema-mutation') return undefined
			// The prepared target boundary carries this operation's logical record.
			const target = input.target as DatabaseLogicalRecord | null | undefined
			return runPreparedPhases(
				input.context,
				operation,
				isPlainRecord(target) || target === null ? target : undefined,
				input.nestedWrite,
			)
		},
		transformPreparedInput: (input) =>
			resolveSchemaInput(
				input.context,
				input.operation,
				input.target,
				input.nestedWrite,
			),
	})
}

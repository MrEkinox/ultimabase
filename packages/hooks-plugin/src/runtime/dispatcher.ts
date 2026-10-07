import {
	createRuntimeBehaviorBoundaries,
	getOperationSchema,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
	readRuntimePreparedMutationRecords,
	Schema,
	transformOperationFieldInputs,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterializationSource,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type NestedWriteGraph,
	type PluginSchemaMutationOperationAst,
	type RequestContext,
	type RuntimeBehaviorStages,
	type RuntimeLogicalMutationOperationAst,
	type RuntimeLogicalOperationAst,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	NormalizedHookHandler,
	SchemaHookPhase,
} from '../authoring/declarations.js'
import { getHookHandlerEntries } from '../authoring/declarations.js'
import type { HookContext, HookOperationKind } from '../context/hook-context.js'
import type {
	HookContribution,
	HookContributionPlan,
	SchemaHookContributionPlan,
} from './contribution-plan.js'
import type {
	HookDiagnosticPhase,
	HookDiagnosticTarget,
} from './diagnostics.js'
import {
	applicationHookOwner,
	createFieldHookTarget,
	createHookExecutionDescriptor,
	createPluginHookOwner,
	createSchemaHookTarget,
	type HookExecutionDescriptor,
	type HookExecutionRuntime,
} from './execution-runtime.js'
import {
	collectMutationAfterItems,
	collectMutationBeforeItems,
	getMutationHookKind,
	getNativeHookPhaseOrder,
} from './lifecycle.js'

/** Flattens one phase while retaining the precompiled contribution order. */
const collectHandlers = <TDeclarations extends object>(
	contributions: readonly HookContribution<TDeclarations>[],
	select: (declarations: TDeclarations) => readonly NormalizedHookHandler[],
	identity: Readonly<{
		declarationBranch?: string
		operationKind: HookOperationKind
		phase: HookDiagnosticPhase
		target: HookDiagnosticTarget
	}>,
): readonly HookExecutionDescriptor[] =>
	immutableArray(
		contributions.flatMap((contribution) => {
			const owner =
				contribution.kind === 'developer'
					? applicationHookOwner
					: createPluginHookOwner(
							contribution.ownerPlugin,
							contribution.localName,
							contribution.ownerInstanceId,
						)
			return select(contribution.declarations).map((entry) =>
				createHookExecutionDescriptor({ ...entry, ...identity, owner }),
			)
		}),
	)

/** Feeds non-undefined replacements forward in declaration order. */
const runTransforms = async <TValue>(
	handlers: readonly HookExecutionDescriptor[],
	initialValue: TValue,
	invoke: (
		handler: HookExecutionDescriptor,
		value: TValue,
	) => Promise<TValue | undefined>,
): Promise<TValue> => {
	let value = initialValue
	for (const handler of handlers) {
		const replacement = await invoke(handler, value)
		// Only undefined keeps the current value; null is a real replacement.
		if (replacement !== undefined) value = replacement
	}
	return value
}

const withNestedWrite = (nestedWrite: NestedWriteGraph | undefined) =>
	nestedWrite === undefined ? {} : { nestedWrite }

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
		descriptor: HookExecutionDescriptor,
		request: RequestContext,
		createInput: (context: HookContext) => unknown,
	): Promise<unknown> =>
		runtime.invoke(descriptor, request, (context) =>
			// Each declaration was type-checked against this exact input when authored.
			descriptor.handler(createInput(context) as never),
		)

	/** Executes effects sequentially so declaration order stays observable. */
	const runEffects = async (
		handlers: readonly HookExecutionDescriptor[],
		request: RequestContext,
		createInput: (context: HookContext) => unknown,
	): Promise<void> => {
		for (const handler of handlers) {
			await invokeHook(handler, request, createInput)
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
		direction: 'after' | 'before',
		phase: SchemaHookPhase,
		operation: DatabaseOperationAst,
	) =>
		collectHandlers(
			schemaPlan.contributions[direction],
			(declarations) =>
				getHookHandlerEntries(
					declarations,
					phase,
					getNativeHookPhaseOrder(operation.kind).family,
				),
			{
				operationKind: operation.kind,
				phase,
				target: createSchemaHookTarget(schemaPlan.schema.className),
			},
		)

	/** Resolves present field values in before order with family-composed handlers. */
	const resolveFieldInputs = async <
		const TOperation extends DatabaseOperationAst,
	>(
		request: RequestContext,
		operation: TOperation,
	): Promise<TOperation> => {
		const { family } = getNativeHookPhaseOrder(operation.kind)
		// Reads and deletes have no input to resolve; preserve their original operation.
		if (family === 'delete' || family === 'read') return operation
		const schema = requireDeclaredOperationSchema(operation)
		if (isBulkMutation(operation)) return operation

		return transformOperationFieldInputs(operation, async (fieldInput) => {
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

			return runTransforms(handlers, fieldInput.value, (handler, value) =>
				invokeHook(handler, request, (context) =>
					immutableRecord({
						context,
						kind: getMutationHookKind(operation.kind),
						mode: fieldInput.mode,
						value,
					}),
				),
			)
		})
	}

	/** Runs schema input resolution only after the visible target is prepared and locked. */
	const resolveSchemaInput = async <
		const TOperation extends DatabaseMutationOperationAst,
	>(
		request: RequestContext,
		operation: TOperation,
		target: DatabaseLogicalRecord | null | undefined,
		nestedWrite: NestedWriteGraph | undefined,
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

		// The stable visible preimage: none for creates, optional for upserts.
		let originalItem: object | null = null
		if (kind !== 'create-one' && !(kind === 'upsert-one' && target === null)) {
			if (!isPlainRecord(target)) {
				throw new TypeError(
					kind === 'update-one'
						? 'Update resolveInput requires one prepared target'
						: 'Upsert resolveInput requires a prepared target snapshot',
				)
			}
			originalItem = materializeSchemaModel(schemaPlan.schema, target)
		}

		return runTransforms(
			schemaHandlers(schemaPlan, 'before', 'resolveInput', operation),
			operation,
			async (handler, current) => {
				const replacement = await invokeHook(handler, request, (context) =>
					immutableRecord({
						context,
						kind: getMutationHookKind(current.kind),
						...withNestedWrite(nestedWrite),
						operation: current,
						originalItem,
					}),
				)
				return replacement === undefined
					? undefined
					: boundaries.snapshotPreparedOperationReplacement(
							current,
							replacement,
						)
			},
		)
	}

	/** Runs singular before-hooks after Runtime has prepared any reliable preimage. */
	const runPreparedPhases = async (
		request: RequestContext,
		operation: DatabaseMutationOperationAst,
		{ target, targets }: ReturnType<typeof readRuntimePreparedMutationRecords>,
		nestedWrite: NestedWriteGraph | undefined,
	): Promise<void> => {
		if (isBulkMutation(operation)) return
		if (
			(operation.kind === 'update-one' || operation.kind === 'delete-one') &&
			target === null
		) {
			return
		}

		const schemaPlan = requireSchemaPlan(operation)
		const { schema } = schemaPlan

		for (const phase of getNativeHookPhaseOrder(operation.kind).schemaBefore) {
			const handlers = schemaHandlers(schemaPlan, 'before', phase, operation)
			if (handlers.length === 0) continue

			const pairs = collectMutationBeforeItems(operation, target, targets)
			for (const pair of pairs) {
				const draft =
					operation.kind === 'create-one' && isPlainRecord(pair.item)
						? materializePreparedSchemaDraft(schema, pair.item)
						: undefined
				const originalItem = materialize(schema, pair.originalItem)

				await runEffects(handlers, request, (context) => {
					if (operation.kind !== 'create-one') {
						// The candidate stays the logical record; its preimage is materialized.
						return immutableRecord({
							context,
							kind: getMutationHookKind(operation.kind),
							...withNestedWrite(nestedWrite),
							operation,
							originalItem,
							item: pair.item,
						})
					}
					if (draft === undefined) {
						throw new TypeError(
							'Prepared create hook requires one draft instance',
						)
					}
					return immutableRecord({
						context,
						item: draft,
						kind: 'create' as const,
						...withNestedWrite(nestedWrite),
					})
				})
			}
		}
	}

	/** Runs singular after-hooks over complete persisted materializations. */
	const runResultPhases = async <TResult>(
		request: RequestContext,
		operation: DatabaseOperationAst,
		result: TResult,
		outcome: DatabaseMutationMaterializationSource | undefined,
		selectedFieldsOverride: readonly string[] | undefined,
		nestedWrite: NestedWriteGraph | undefined,
	): Promise<TResult> => {
		const schemaPlan = requireSchemaPlan(operation)
		const order = getNativeHookPhaseOrder(operation.kind)
		// The boundary preserves the exact generic result while restoring metadata.
		const snapshot = boundaries.snapshotResultReplacement(
			operation,
			result,
			selectedFieldsOverride,
		) as TResult

		if (order.family === 'read' || isBulkMutation(operation)) return snapshot
		if (outcome === undefined) {
			throw new TypeError(
				'Schema mutation after-hooks require private materializations',
			)
		}

		const items = collectMutationAfterItems(outcome)
		for (const phase of order.schemaAfter) {
			const handlers = schemaHandlers(schemaPlan, 'after', phase, operation)
			for (const pair of items) {
				const originalItem = materialize(schemaPlan.schema, pair.originalItem)
				const item = materialize(schemaPlan.schema, pair.item)
				await runEffects(handlers, request, (context) =>
					immutableRecord({
						context,
						item,
						originalItem,
						kind: getMutationHookKind(operation.kind),
						...withNestedWrite(nestedWrite),
						operation,
					}),
				)
			}
		}

		return snapshot
	}

	/**
	 * Runs one exact custom mutation branch around its owner-resolved effect.
	 *
	 * Dispatch uses the logical command, never its physical statement, so
	 * native update or delete Hooks never observe a custom mutation.
	 */
	const runSchemaMutationHooks = async (
		request: RequestContext,
		operation: PluginSchemaMutationOperationAst,
		phase: 'afterOperation' | 'beforeOperation',
		readPair: () =>
			Readonly<{ originalItem: unknown; item: unknown }> | undefined,
		pairError: string,
	): Promise<void> => {
		const schema = operation.query.schema.definition
		if (!Schema.is(schema)) {
			throw new TypeError('Schema mutation Hooks require a declared schema')
		}
		const schemaPlan = plan.getSchema(schema)
		const descriptor = schemaPlan?.schemaMutations.get(operation.command)
		if (
			schemaPlan === undefined ||
			descriptor?.schema !== schema ||
			descriptor.mutation !== operation.mutation ||
			descriptor.owner !== operation.owner
		) {
			throw new TypeError('Schema mutation Hook identity is unavailable')
		}

		const pair = readPair()
		const originalItem = pair?.originalItem
		const item = pair?.item
		if (
			!isPlainRecord(originalItem) ||
			(item !== null && !isPlainRecord(item))
		) {
			throw new TypeError(pairError)
		}
		const handlers = collectHandlers(
			schemaPlan.contributions[
				phase === 'beforeOperation' ? 'before' : 'after'
			],
			(declarations) =>
				declarations.mutations?.[operation.command]?.[phase]?.all ?? [],
			{
				declarationBranch: operation.command,
				operationKind: 'plugin-schema-mutation',
				phase,
				target: createSchemaHookTarget(schemaPlan.schema.className),
			},
		)

		await runEffects(handlers, request, (context) =>
			immutableRecord({
				context,
				input: operation.input,
				item: item === null ? null : materializeSchemaModel(schema, item),
				mutation: immutableRecord({
					authority: operation.mutation.authority,
					effect: operation.mutation.effect,
					kind: operation.mutation.kind,
					name: operation.mutation.name,
					version: operation.mutation.version,
				}),
				originalItem: materializeSchemaModel(schema, originalItem),
				target: immutableRecord({ id: operation.id, schema }),
			}),
		)
	}

	return immutableRecord({
		beforeOperation: (input) => {
			const operation: RuntimeLogicalOperationAst = input.operation
			if (operation.kind !== 'plugin-schema-mutation') return undefined
			return runSchemaMutationHooks(
				input.context,
				operation,
				'beforeOperation',
				() => operation,
				'Schema mutation before Hooks require a logical item pair',
			)
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
					input.nestedWrite?.graph,
				)
			}
			await runSchemaMutationHooks(
				input.context,
				operation,
				'afterOperation',
				() => {
					if (input.outcome === undefined) {
						throw new TypeError(
							'Schema mutation after Hooks require one materialization',
						)
					}
					const [pair, ...remaining] = collectMutationAfterItems(input.outcome)
					return remaining.length > 0 ? undefined : pair
				},
				'Schema mutation after Hooks require one logical item pair',
			)
			return input.result
		},
		observePreparedMutation: (input) => {
			const operation: RuntimeLogicalMutationOperationAst = input.operation
			if (operation.kind === 'plugin-schema-mutation') return undefined
			return runPreparedPhases(
				input.context,
				operation,
				readRuntimePreparedMutationRecords({
					target: input.target,
					targets: input.targets,
				}),
				input.nestedWrite?.graph,
			)
		},
		transformPreparedInput: (input) =>
			resolveSchemaInput(
				input.context,
				input.operation,
				input.target,
				input.nestedWrite?.graph,
			),
	})
}

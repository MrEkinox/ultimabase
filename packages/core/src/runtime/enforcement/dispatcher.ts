import {
	FrameworkApplication,
	FrameworkError,
	type PluginContribution,
	type PluginDefinition,
} from '../../foundation.js'
import type {
	ExecutableOperationAst,
	QueryAst,
	QueryExpressionNode,
	QueryRelationFilterNode,
	QuerySelectedFieldNode,
} from '../../query/index.js'
import {
	createQueryAst,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
} from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseConstraintNode,
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimeDatabaseResultStageInput,
	RuntimeEnforcementOperationResult,
	RuntimeEnforcementStages,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import type { EnforcementContributionImplementation } from './definitions.js'
import {
	getEnforcementContributionImplementation,
	matchesEnforcementContribution,
} from './definitions.js'
import {
	appendEnforcementConstraints,
	appendEnforcementRelationPredicates,
	createEnforcementState,
	getEnforcementStateSnapshot,
	narrowEnforcementFields,
	type EnforcementState,
} from './state.js'
import {
	createSchemaHookTarget,
	createHookExecutionDescriptor,
	createPluginHookOwner,
	globalHookTarget,
	type HookExecutionDescriptor,
} from '../hooks/execution-descriptor.js'
import {
	getApplicationHookExecutionRuntime,
	type HookExecutionRuntime,
} from '../hooks/execution-runtime.js'
import { NativeAccessRuntime } from '../access/dispatcher.js'
import { readOperationQueries } from '../operations/queries.js'

interface OwnedEnforcementContribution {
	readonly contribution: PluginContribution
	readonly implementation: EnforcementContributionImplementation
}

/** Reads only the relation leaves owned by the current schema expression level. */
const collectDirectRelationPredicates = (
	expression: QueryExpressionNode,
): readonly QueryRelationFilterNode[] => {
	if (
		isQueryRelationCountNode(expression) ||
		isQueryRelationPredicateNode(expression)
	) {
		return immutableArray([expression])
	}

	const candidate: unknown = expression

	if (!isPlainRecord(candidate)) {
		return immutableArray([])
	}

	const collected: QueryRelationFilterNode[] = []

	if (isUnknownArray(candidate.expressions)) {
		for (const child of candidate.expressions) {
			if (isPlainRecord(child) && typeof child.kind === 'string') {
				collected.push(
					...collectDirectRelationPredicates(
						child as unknown as QueryExpressionNode,
					),
				)
			}
		}
	}

	if (
		isPlainRecord(candidate.expression) &&
		typeof candidate.expression.kind === 'string'
	) {
		collected.push(
			...collectDirectRelationPredicates(
				candidate.expression as unknown as QueryExpressionNode,
			),
		)
	}

	return immutableArray(collected)
}

/** Gives policy hooks the same recursion and diagnostic identity as business hooks. */
const createEnforcementExecutionDescriptor = (
	owned: OwnedEnforcementContribution,
	operation: DatabaseOperationAst,
): HookExecutionDescriptor => {
	const { contribution, implementation } = owned
	return createHookExecutionDescriptor({
		handler: (input) => implementation.run(input),
		handlerIndex: 0,
		operationKind: operation.kind,
		owner: createPluginHookOwner(contribution.ownerPlugin, contribution.name),
		phase: implementation.kind,
		target:
			implementation.schema === undefined
				? globalHookTarget
				: createSchemaHookTarget(implementation.schema.className),
	})
}

/** Returns a trusted schema only after preserving the normalized AST invariant. */
const readOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Runtime enforcement requires a schema definition')
	}

	return schema
}

/** Compiles only protected enforcement definitions from the shared hook registry. */
const readEnforcementContributions = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): readonly OwnedEnforcementContribution[] => {
	const contributions: OwnedEnforcementContribution[] = []

	for (const contribution of application.getContributions('hooks')) {
		const implementation = getEnforcementContributionImplementation(
			contribution.value,
		)

		if (implementation === undefined) {
			continue
		}

		if (
			implementation.schema !== undefined &&
			!application.ownsSchema(implementation.schema)
		) {
			throw new TypeError(
				`Enforcement contribution "${contribution.name}" references a schema outside its application`,
			)
		}

		contributions.push(immutableRecord({ contribution, implementation }))
	}

	return immutableArray(contributions)
}

/** Rejects field names that do not belong to the exact operation schema. */
const normalizeRestrictedFields = (
	fields: unknown,
	schema: SchemaDefinition,
	contribution: PluginContribution,
): readonly string[] => {
	if (!isUnknownArray(fields)) {
		throw new TypeError(
			`Enforcement contribution "${contribution.name}" must return a field array`,
		)
	}

	const normalized: string[] = []

	for (const field of fields) {
		if (typeof field !== 'string' || !Object.hasOwn(schema.fields, field)) {
			throw new TypeError(
				`Enforcement contribution "${contribution.name}" returned an unknown schema field`,
			)
		}

		if (!normalized.includes(field)) {
			normalized.push(field)
		}
	}

	return immutableArray(normalized)
}

/** Evaluates every policy once while keeping the accumulated state private. */
const evaluateContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
	initialState: EnforcementState = createEnforcementState(),
): Promise<EnforcementState> => {
	const schema = readOperationSchema(input.operation)
	let state = initialState

	for (const owned of contributions) {
		const { contribution, implementation } = owned
		if (
			implementation.kind === 'restrictOutput' ||
			(input.context.access.mode === 'master' &&
				implementation.master === 'bypass') ||
			!matchesEnforcementContribution(implementation, input.operation, schema)
		) {
			continue
		}

		const output: unknown = await runtime.invoke(
			createEnforcementExecutionDescriptor(owned, input.operation),
			input.context,
			() =>
				implementation.run(
					immutableRecord({
						context: input.context,
						operation: input.operation,
					}) as never,
				),
		)

		switch (implementation.kind) {
			case 'guard':
				if (output !== undefined) {
					throw new TypeError(
						`Enforcement guard "${contribution.name}" must return undefined`,
					)
				}
				break
			case 'constraint':
				state = appendEnforcementConstraints(
					state,
					output as DatabaseConstraintNode | readonly DatabaseConstraintNode[],
				)
				break
			case 'restrictInput':
			case 'restrictSelection': {
				const boundary =
					implementation.kind === 'restrictInput' ? 'input' : 'selection'
				state = narrowEnforcementFields(
					state,
					boundary,
					normalizeRestrictedFields(output, schema, contribution),
				)
				break
			}
		}
	}

	return state
}

const isSystemField = (schema: SchemaDefinition, field: string): boolean => {
	const definition: unknown = schema.fields[field]

	return (
		isPlainRecord(definition) &&
		isPlainRecord(definition.options) &&
		definition.options.system === true
	)
}

/** Produces one stable denial without revealing another policy's permitted set. */
const createRestrictedInputError = (field: string): FrameworkError =>
	new FrameworkError(
		'PERMISSION_DENIED',
		`Mutation input contains restricted field: ${field}`,
		{
			publicMessage: 'The operation is not permitted.',
			internalDetails: { field },
		},
	)

const assertPermittedInputRecord = (
	input: unknown,
	permittedFields: readonly string[],
	schema: SchemaDefinition,
): void => {
	if (!isPlainRecord(input)) {
		return
	}

	for (const field of Object.keys(input)) {
		if (!permittedFields.includes(field) && !isSystemField(schema, field)) {
			throw createRestrictedInputError(field)
		}
	}
}

const assertPermittedUpdate = (
	update: unknown,
	permittedFields: readonly string[],
	schema: SchemaDefinition,
): void => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return
	}

	for (const operation of update.operations) {
		if (
			isPlainRecord(operation) &&
			typeof operation.field === 'string' &&
			!permittedFields.includes(operation.field) &&
			!isSystemField(schema, operation.field)
		) {
			throw createRestrictedInputError(operation.field)
		}
	}
}

/** Applies mutation restrictions without giving policies replacement authority. */
const assertPermittedMutationInput = (
	operation: DatabaseOperationAst,
	permittedFields: readonly string[] | undefined,
	schema: SchemaDefinition,
): void => {
	if (permittedFields === undefined) {
		return
	}
	// Structural validation has already proven the closed executable-operation union.
	const executable = operation as unknown as ExecutableOperationAst

	switch (executable.kind) {
		case 'create-one':
			assertPermittedInputRecord(executable.input, permittedFields, schema)
			break
		case 'create-many':
			for (const input of executable.inputs) {
				assertPermittedInputRecord(input, permittedFields, schema)
			}
			break
		case 'update-one':
		case 'update-many':
			assertPermittedUpdate(executable.update, permittedFields, schema)
			break
		case 'upsert-one':
			assertPermittedInputRecord(executable.create, permittedFields, schema)
			assertPermittedUpdate(executable.update, permittedFields, schema)
			break
		case 'upsert-many':
			for (const item of executable.items) {
				assertPermittedInputRecord(item.create, permittedFields, schema)
				assertPermittedUpdate(item.update, permittedFields, schema)
			}
			break
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			break
	}
}

const createSelectedField = (field: string): QuerySelectedFieldNode =>
	immutableRecord({ field, kind: 'selected-field' })

/** Intersects explicit selections and materializes implicit select-all safely. */
const restrictQuerySelection = (
	query: QueryAst,
	permittedFields: readonly string[],
): QueryAst => {
	const selection = restrictSelection(query.selection, permittedFields)

	return immutableRecord({
		...query,
		selection,
	})
}

/** Intersects one normalized selection without coupling it to a QueryBuilder container. */
const restrictSelection = (
	selection: QueryAst['selection'],
	permittedFields: readonly string[],
): QueryAst['selection'] => {
	const requestedFields = selection.fields.map(({ field }) => field)
	const selectedFields =
		requestedFields.length === 0
			? permittedFields
			: requestedFields.filter((field) => permittedFields.includes(field))

	return immutableRecord({
		fields: immutableArray(selectedFields.map(createSelectedField)),
		kind: 'selection',
	})
}

/** Rewrites only query selections while preserving the exact terminal shape. */
const restrictOperationSelection = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	permittedFields: readonly string[] | undefined,
): TOperation => {
	if (permittedFields === undefined) {
		return operation
	}
	// The pipeline accepts only normalized executable operations at this point.
	const executable = operation as unknown as ExecutableOperationAst

	if ('query' in executable) {
		return immutableRecord({
			...operation,
			query: restrictQuerySelection(executable.query, permittedFields),
		})
	}

	if (executable.kind === 'create-one' || executable.kind === 'create-many') {
		return immutableRecord({
			...operation,
			selection: restrictSelection(executable.selection, permittedFields),
		})
	}

	return immutableRecord({
		...operation,
		selection: restrictSelection(executable.selection, permittedFields),
		items: immutableArray(
			executable.items.map((item) =>
				immutableRecord({
					...item,
					query: restrictQuerySelection(item.query, permittedFields),
				}),
			),
		),
	})
}

/** Reapplies the immutable plan after business transforms without reevaluation. */
const enforceOperation = <const TOperation extends DatabaseOperationAst>(
	input: RuntimeOperationStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): RuntimeEnforcementOperationResult<TOperation> => {
	const schema = readOperationSchema(input.operation)
	const snapshot = getEnforcementStateSnapshot(input.enforcement)

	assertPermittedMutationInput(input.operation, snapshot.inputFields, schema)

	return immutableRecord({
		constraints: snapshot.constraints,
		operation: restrictOperationSelection(
			input.operation,
			snapshot.selectionFields,
		),
		...(snapshot.rowFilter === undefined
			? {}
			: { rowFilter: snapshot.rowFilter }),
		...(snapshot.relationPredicates.length === 0
			? {}
			: { relationPredicates: snapshot.relationPredicates }),
	})
}

/** Applies one final projection to plain adapter result records only. */
const restrictResultRecord = (
	result: Readonly<Record<string, unknown>>,
	permittedFields: readonly string[],
): Readonly<Record<string, unknown>> => {
	const entries = Object.entries(result).filter(([field]) =>
		permittedFields.includes(field),
	)
	const restricted = immutableRecord(Object.fromEntries(entries))

	transferRuntimeSchemaModelMetadata(result, restricted)

	return restricted
}

const restrictResult = <const TResult>(
	result: TResult,
	permittedFields: readonly string[] | undefined,
): TResult => {
	if (permittedFields === undefined || result === null) {
		return result
	}

	const unknownResult: unknown = result

	if (isUnknownArray(unknownResult)) {
		return immutableArray(
			unknownResult.map((record) =>
				isPlainRecord(record)
					? restrictResultRecord(record, permittedFields)
					: record,
			),
		) as TResult
	}

	return (
		isPlainRecord(unknownResult)
			? restrictResultRecord(unknownResult, permittedFields)
			: result
	) as TResult
}

/** Hides selection-restricted fields before any business output hook can observe them. */
const enforceSelectionResult = <const TOperation extends DatabaseOperationAst>(
	input: RuntimeDatabaseResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): DatabaseOperationResult<TOperation> => {
	const snapshot = getEnforcementStateSnapshot(input.enforcement)

	return restrictResult(input.result, snapshot.selectionFields)
}

/** Evaluates final output restrictions after business result replacement. */
const enforceResult = async <const TOperation extends DatabaseOperationAst>(
	contributions: readonly OwnedEnforcementContribution[],
	runtime: HookExecutionRuntime,
	input: RuntimeResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): Promise<RuntimeOperationResult<TOperation>> => {
	const schema = readOperationSchema(input.operation)
	let state = input.enforcement

	for (const owned of contributions) {
		const { contribution, implementation } = owned
		if (
			implementation.kind !== 'restrictOutput' ||
			(input.context.access.mode === 'master' &&
				implementation.master === 'bypass') ||
			!matchesEnforcementContribution(implementation, input.operation, schema)
		) {
			continue
		}

		const output: unknown = await runtime.invoke(
			createEnforcementExecutionDescriptor(owned, input.operation),
			input.context,
			() =>
				implementation.run(
					immutableRecord({
						context: input.context,
						operation: input.operation,
						result: input.result,
					}) as never,
				),
		)
		state = narrowEnforcementFields(
			state,
			'output',
			normalizeRestrictedFields(output, schema, contribution),
		)
	}

	const snapshot = getEnforcementStateSnapshot(state)
	const permittedFields =
		snapshot.outputFields === undefined
			? snapshot.selectionFields
			: snapshot.selectionFields === undefined
				? snapshot.outputFields
				: snapshot.outputFields.filter((field) =>
						snapshot.selectionFields?.includes(field),
					)

	return restrictResult(input.result, permittedFields)
}

/** Compiles native Access and optional low-level restrictions into one monotonic boundary. */
export const createEnforcementStages = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): RuntimeEnforcementStages | undefined => {
	if (!(application instanceof FrameworkApplication)) {
		throw new TypeError('Runtime enforcement requires a FrameworkApplication')
	}

	const contributions = readEnforcementContributions(application)
	const runtime = getApplicationHookExecutionRuntime(application)
	const access = new NativeAccessRuntime(application)

	/** Evaluates target policy recursively without merging it into source policy. */
	const evaluateRelationPredicates = async <
		const TOperation extends DatabaseOperationAst,
	>(
		input: RuntimeOperationStageInput<TOperation>,
		initialState: EnforcementState,
	): Promise<EnforcementState> => {
		const executable = input.operation as unknown as ExecutableOperationAst
		let state = initialState

		for (const query of readOperationQueries(executable)) {
			if (query.where === undefined) {
				continue
			}

			for (const predicate of collectDirectRelationPredicates(
				query.where.expression,
			)) {
				if (
					getEnforcementStateSnapshot(state).relationPredicates.some(
						(scope) => scope.predicate === predicate,
					)
				) {
					continue
				}

				await access.enforceRelationPredicateRead(input, predicate)

				const targetQuery = immutableRecord({
					...createQueryAst(predicate.target.definition),
					...(predicate.kind === 'relation-count' &&
					predicate.expression.kind === 'constant' &&
					predicate.expression.value
						? {}
						: {
								where: immutableRecord({
									kind: 'where' as const,
									expression: predicate.expression,
								}),
							}),
				})
				const targetOperation = immutableRecord({
					kind: 'exists' as const,
					query: targetQuery,
				})
				const targetInput = immutableRecord({
					context: input.context,
					operation: targetOperation,
				})
				let targetState = await access.evaluate(
					targetInput,
					createEnforcementState(),
				)

				targetState = await evaluateContributions(
					contributions,
					runtime,
					targetInput,
					targetState,
				)
				targetState = await evaluateRelationPredicates(targetInput, targetState)

				const targetSnapshot = getEnforcementStateSnapshot(targetState)
				state = appendEnforcementRelationPredicates(state, [
					immutableRecord({
						constraints: targetSnapshot.constraints,
						predicate,
						...(targetSnapshot.rowFilter === undefined
							? {}
							: { rowFilter: targetSnapshot.rowFilter }),
					}),
					...targetSnapshot.relationPredicates,
				])
			}
		}

		return state
	}
	const enforceAccessSelectionResult: RuntimeEnforcementStages['enforceSelectionResult'] =
		async (input) =>
			access.enforceOutput({
				context: input.context,
				operation: input.operation,
				result: enforceSelectionResult(input),
			})
	const enforceAccessResult: RuntimeEnforcementStages['enforceResult'] = async (
		input,
	) =>
		access.enforceOutput({
			context: input.context,
			operation: input.operation,
			result: await enforceResult(contributions, runtime, input),
		})

	return immutableRecord({
		evaluate: async (input) => {
			const state = await evaluateContributions(
				contributions,
				runtime,
				input,
				await access.evaluate(input, createEnforcementState()),
			)

			return evaluateRelationPredicates(input, state)
		},
		enforceOperation: (input) => enforceOperation(input),
		enforceRelationRead: (input) => access.enforceRelationRead(input),
		enforcePreparedMutation: (input) => access.enforcePreparedMutation(input),
		enforceMutationOutcome: (input) => access.enforceMutationOutcome(input),
		enforceSelectionResult: enforceAccessSelectionResult,
		enforceResult: enforceAccessResult,
		reevaluate: async (input) => {
			const state = await evaluateContributions(
				contributions,
				runtime,
				input,
				await access.reevaluate(input, input.enforcement),
			)

			return evaluateRelationPredicates(input, state)
		},
	})
}

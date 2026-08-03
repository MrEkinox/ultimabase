import {
	FrameworkApplication,
	FrameworkError,
	type PluginContribution,
	type PluginDefinition,
} from '../../foundation.js'
import type {
	ExecutableOperationAst,
	QueryAst,
	QuerySelectedFieldNode,
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
import {
	isNonAtomicBulkOperation,
	mapNonAtomicBulkResult,
} from '../operations/non-atomic-result.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimeEnforcementOperationResult,
	RuntimeEnforcementStages,
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

interface OwnedEnforcementContribution {
	readonly contribution: PluginContribution
	readonly implementation: EnforcementContributionImplementation
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
		case 'find':
		case 'first':
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
	const requestedFields = query.selection.fields.map(({ field }) => field)
	const selectedFields =
		requestedFields.length === 0
			? permittedFields
			: requestedFields.filter((field) => permittedFields.includes(field))

	return immutableRecord({
		...query,
		selection: immutableRecord({
			fields: immutableArray(selectedFields.map(createSelectedField)),
			kind: 'selection',
		}),
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

	if (executable.kind === 'upsert-many') {
		return immutableRecord({
			...operation,
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

	return operation
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

	return immutableRecord(Object.fromEntries(entries))
}

const restrictResult = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
	permittedFields: readonly string[] | undefined,
): DatabaseOperationResult<TOperation> => {
	if (permittedFields === undefined || result === null) {
		return result
	}

	const unknownResult: unknown = result

	if (isNonAtomicBulkOperation(operation)) {
		return mapNonAtomicBulkResult(
			unknownResult,
			'Runtime restricted result',
			(record) =>
				isPlainRecord(record)
					? restrictResultRecord(record, permittedFields)
					: record,
		) as DatabaseOperationResult<TOperation>
	}

	if (isUnknownArray(unknownResult)) {
		return immutableArray(
			unknownResult.map((record) =>
				isPlainRecord(record)
					? restrictResultRecord(record, permittedFields)
					: record,
			),
		) as DatabaseOperationResult<TOperation>
	}

	return (
		isPlainRecord(unknownResult)
			? restrictResultRecord(unknownResult, permittedFields)
			: result
	) as DatabaseOperationResult<TOperation>
}

/** Hides selection-restricted fields before any business output hook can observe them. */
const enforceSelectionResult = <const TOperation extends DatabaseOperationAst>(
	input: RuntimeResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): DatabaseOperationResult<TOperation> => {
	const snapshot = getEnforcementStateSnapshot(input.enforcement)

	return restrictResult(input.operation, input.result, snapshot.selectionFields)
}

/** Evaluates final output restrictions after business result replacement. */
const enforceResult = async <const TOperation extends DatabaseOperationAst>(
	contributions: readonly OwnedEnforcementContribution[],
	runtime: HookExecutionRuntime,
	input: RuntimeResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
): Promise<DatabaseOperationResult<TOperation>> => {
	const schema = readOperationSchema(input.operation)
	let state = input.enforcement

	for (const owned of contributions) {
		const { contribution, implementation } = owned
		if (
			implementation.kind !== 'restrictOutput' ||
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

	return restrictResult(input.operation, input.result, permittedFields)
}

/** Compiles deterministic enforcement stages only when a plugin contributed one. */
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

	if (contributions.length === 0) {
		return undefined
	}

	const runtime = getApplicationHookExecutionRuntime(application)

	return immutableRecord({
		evaluate: (input) => evaluateContributions(contributions, runtime, input),
		enforceOperation: (input) => enforceOperation(input),
		enforceSelectionResult: (input) => enforceSelectionResult(input),
		enforceResult: (input) => enforceResult(contributions, runtime, input),
		reevaluate: (input) =>
			evaluateContributions(contributions, runtime, input, input.enforcement),
	})
}

import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertDatabaseConstraintVersion } from '../../plugins/constraint-compilers.js'
import type {
	DatabaseConstraintNode,
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { getEnforcementStateSnapshot } from '../enforcement/state.js'
import type { EnforcementState } from '../enforcement/state.js'
import type { RequestContext } from '../context/request-context.js'
import {
	readRuntimeNestedWriteStageContext,
	type RuntimeNestedWriteStageContext,
} from '../nested-writes/execution-context.js'
import type {
	RuntimeEnforcementStageInput,
	RuntimeMutationOutcomeStageInput,
	RuntimeProjectedDatabaseResultStageInput,
	RuntimeMaterializedResultStageInput,
	RuntimeMutationRevalidationStageInput,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeResultStageInput,
} from './contracts.js'

export const emptyRuntimeConstraints: readonly DatabaseConstraintNode[] =
	immutableArray([])

const createRuntimeStageInput = <const TInput extends object>(
	input: TInput,
): TInput &
	Readonly<{
		nestedWrite?: RuntimeNestedWriteStageContext
	}> => {
	const nestedWrite = readRuntimeNestedWriteStageContext()

	return immutableRecord({
		...input,
		...(nestedWrite === undefined ? {} : { nestedWrite }),
	})
}

/** Copies constraint collections so plugins cannot mutate later adapter input. */
export const snapshotRuntimeConstraints = (
	constraints: readonly DatabaseConstraintNode[],
): readonly DatabaseConstraintNode[] => {
	const untrustedConstraints: unknown = constraints

	if (!isUnknownArray(untrustedConstraints)) {
		throw new TypeError('Runtime enforcement constraints must be an array')
	}

	for (const constraint of untrustedConstraints) {
		if (!isPlainRecord(constraint)) {
			throw new TypeError('Runtime enforcement returned an invalid constraint')
		}

		assertNonEmptyString(constraint.kind, 'Runtime enforcement constraint kind')
		assertDatabaseConstraintVersion(
			constraint.version,
			'Runtime enforcement constraint version',
		)

		if (!Object.hasOwn(constraint, 'payload')) {
			throw new TypeError(
				'Runtime enforcement constraint must contain an opaque payload',
			)
		}
	}

	return immutableArray(constraints)
}

export const createRuntimeOperationInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
): RuntimeOperationStageInput<TOperation> =>
	createRuntimeStageInput({ context, operation })

export const createRuntimeMutationRevalidationInput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	context: RequestContext,
	previousOperation: TOperation,
	operation: TOperation,
	target: DatabaseMutationLogicalRecord<TOperation> | null | undefined,
	targets: readonly DatabaseMutationLogicalRecord<TOperation>[] | undefined,
): RuntimeMutationRevalidationStageInput<TOperation> =>
	createRuntimeStageInput({
		context,
		operation,
		previousOperation,
		target,
		...(targets === undefined ? {} : { targets }),
	})

export const createRuntimeEnforcementInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	enforcement: EnforcementState,
): RuntimeEnforcementStageInput<TOperation> =>
	createRuntimeStageInput({ context, enforcement, operation })

export const createRuntimePreparedMutationInput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	target: DatabaseMutationLogicalRecord<TOperation> | null | undefined,
	targets: readonly DatabaseMutationLogicalRecord<TOperation>[] | undefined,
): RuntimePreparedMutationStageInput<TOperation> =>
	createRuntimeStageInput({
		context,
		operation,
		target,
		...(targets === undefined ? {} : { targets }),
	})

export const createRuntimeMutationOutcomeInput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	outcome: DatabaseOperationOutcome<TOperation>,
	selectedFieldsOverride?: readonly string[],
): RuntimeMutationOutcomeStageInput<TOperation> =>
	createRuntimeStageInput({
		context,
		operation,
		outcome,
		...(selectedFieldsOverride === undefined ? {} : { selectedFieldsOverride }),
	})

export const createRuntimeEnforcementResultInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
	enforcement: EnforcementState,
): RuntimeResultStageInput<TOperation> & {
	readonly enforcement: EnforcementState
} => createRuntimeStageInput({ context, enforcement, operation, result })

export const createRuntimeResultInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
): RuntimeResultStageInput<TOperation> =>
	createRuntimeStageInput({ context, operation, result })

export const createRuntimeMaterializedResultInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
	selectedFieldsOverride: readonly string[] | undefined,
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst> | undefined,
): RuntimeMaterializedResultStageInput<TOperation> =>
	createRuntimeStageInput({
		context,
		operation,
		...(outcome === undefined ? {} : { outcome }),
		result,
		...(selectedFieldsOverride === undefined ? {} : { selectedFieldsOverride }),
	})

export const createRuntimeProjectedDatabaseResultInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
	selectedFieldsOverride: readonly string[] | undefined,
): RuntimeProjectedDatabaseResultStageInput<TOperation> =>
	createRuntimeStageInput({
		context,
		operation,
		result,
		...(selectedFieldsOverride === undefined ? {} : { selectedFieldsOverride }),
	})

const readOperationSelectionFields = (
	operation: DatabaseOperationAst,
): readonly string[] | undefined => {
	const candidate: unknown = operation

	if (!isPlainRecord(candidate)) {
		return undefined
	}
	const selection: unknown =
		candidate.kind === 'create-one' ||
		candidate.kind === 'create-many' ||
		candidate.kind === 'upsert-many'
			? candidate.selection
			: isPlainRecord(candidate.query)
				? candidate.query.selection
				: undefined

	if (!isPlainRecord(selection) || !isUnknownArray(selection.fields)) {
		return undefined
	}

	const selectedFields: string[] = []

	for (const selected of selection.fields) {
		if (isPlainRecord(selected) && typeof selected.field === 'string') {
			selectedFields.push(selected.field)
		}
	}

	return immutableArray(selectedFields)
}

/** Reads the effective projection after enforcement materializes select-all. */
export const readRuntimeSelectedFieldsOverride = (
	operation: DatabaseOperationAst,
	enforcement: EnforcementState | undefined,
): readonly string[] | undefined => {
	if (enforcement === undefined) {
		return undefined
	}

	const permittedFields =
		getEnforcementStateSnapshot(enforcement).selectionFields

	if (permittedFields === undefined) {
		return undefined
	}

	return readOperationSelectionFields(operation) ?? permittedFields
}

/** Retains the effective public projection for immutable model commands. */
export const readRuntimeSchemaModelSelectedFields = (
	operation: DatabaseOperationAst,
	selectedFieldsOverride: readonly string[] | undefined,
): readonly string[] | undefined => {
	if (selectedFieldsOverride !== undefined) {
		return selectedFieldsOverride
	}

	const selectedFields = readOperationSelectionFields(operation)

	return selectedFields?.length === 0 ? undefined : selectedFields
}

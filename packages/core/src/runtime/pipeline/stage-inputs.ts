import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseRelationPredicateScope,
	DatabaseRelationReference,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	combineDatabaseRowFilters,
	getEnforcementStateSnapshot,
	type EnforcementState,
} from '../enforcement/state.js'
import type { RequestContext } from '../context/request-context.js'
import {
	readRuntimeNestedWriteStageContext,
	type RuntimeNestedWriteStageContext,
} from '../nested-writes/execution-context.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import type {
	RuntimeEnforcementStageInput,
	RuntimeLogicalOperationAst,
	RuntimeOperationStageInput,
	RuntimePipelineStages,
	RuntimePreparedMutationStageInput,
} from './contracts.js'
import { readOperationResultSelection } from '../operations/queries.js'

/** Freezes one stage envelope beside the Core-owned nested node that is active. */
export const createRuntimeStageInput = <const TInput extends object>(
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

export const createRuntimeOperationInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
): RuntimeOperationStageInput<TOperation> =>
	createRuntimeStageInput({ context, operation })

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
): RuntimePreparedMutationStageInput<
	TOperation,
	DatabaseMutationLogicalRecord<TOperation>
> =>
	createRuntimeStageInput({
		context,
		operation,
		target,
		...(targets === undefined ? {} : { targets }),
	})

/** Retains every protected restriction prepared for one read or mutation. */
export interface RuntimeOperationEnforcement<
	TOperation extends DatabaseOperationAst,
> {
	readonly enforcement: EnforcementState | undefined
	readonly operation: TOperation
	readonly relationPredicates:
		readonly DatabaseRelationPredicateScope[] | undefined
	readonly rowFilter: DatabaseRowFilterNode | undefined
}

/**
 * Applies protected policy before resolving one application-owned relation filter,
 * then prepares every relation predicate against the final private filters.
 */
export const enforceRuntimeOperation = async <
	const TOperation extends DatabaseOperationAst,
>(
	stages: Readonly<RuntimePipelineStages>,
	context: RequestContext,
	initialOperation: TOperation,
	relation: DatabaseRelationReference | undefined,
	privateRowFilter: DatabaseRowFilterNode | undefined,
	relationFilterResolver: RuntimeRelationFilterResolver | undefined,
): Promise<RuntimeOperationEnforcement<TOperation>> => {
	let operation = initialOperation
	let enforcement: EnforcementState | undefined
	let policyRowFilter: DatabaseRowFilterNode | undefined
	let policyPredicates: readonly DatabaseRelationPredicateScope[] | undefined

	if (stages.enforcement !== undefined) {
		enforcement = await stages.enforcement.evaluate(
			createRuntimeOperationInput(context, operation),
		)
		const enforced = await stages.enforcement.enforceOperation(
			createRuntimeEnforcementInput(context, operation, enforcement),
		)
		operation = enforced.operation
		policyRowFilter = enforced.rowFilter
		policyPredicates = enforced.relationPredicates
	}

	const relationFilter =
		relation === undefined
			? undefined
			: await relationFilterResolver?.resolve(context, operation, relation)
	const rowFilter = combineDatabaseRowFilters(
		combineDatabaseRowFilters(privateRowFilter, relationFilter),
		policyRowFilter,
	)
	const relationPredicates =
		(await relationFilterResolver?.preparePredicates({
			context,
			operation,
			relationPredicates: policyPredicates,
			rowFilter,
		})) ?? policyPredicates

	return immutableRecord({
		enforcement,
		operation,
		relationPredicates,
		rowFilter,
	})
}

const readOperationSelectionFields = (
	operation: RuntimeLogicalOperationAst,
): readonly string[] =>
	immutableArray(
		readOperationResultSelection(operation).fields.flatMap((selected) =>
			isPlainRecord(selected) && typeof selected.field === 'string'
				? [selected.field]
				: [],
		),
	)

/** Reads the effective projection after enforcement materializes select-all. */
export const readRuntimeSelectedFieldsOverride = (
	operation: RuntimeLogicalOperationAst,
	enforcement: EnforcementState | undefined,
): readonly string[] | undefined =>
	enforcement === undefined ||
	getEnforcementStateSnapshot(enforcement).selectionFields === undefined
		? undefined
		: readOperationSelectionFields(operation)

/** Retains the effective public projection for immutable model commands. */
export const readRuntimeSchemaModelSelectedFields = (
	operation: RuntimeLogicalOperationAst,
	selectedFieldsOverride: readonly string[] | undefined,
): readonly string[] | undefined => {
	if (selectedFieldsOverride !== undefined) return selectedFieldsOverride

	const selectedFields = readOperationSelectionFields(operation)

	return selectedFields.length === 0 ? undefined : selectedFields
}

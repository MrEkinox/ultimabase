import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import type {
	DatabaseOperationAst,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
} from '../../schema/nested-writes/contracts.js'
import type { RuntimeNestedWriteCoordinator } from '../nested-writes/execution.js'

/** Combines independent private restrictions without making either transformable. */
export const combineDatabaseRowFilters = (
	first: DatabaseRowFilterNode | undefined,
	second: DatabaseRowFilterNode | undefined,
): DatabaseRowFilterNode | undefined => {
	if (first === undefined) return second
	if (second === undefined) return first

	return normalizeLogicalFilter({
		kind: 'and',
		expressions: [first, second],
	})
}

/** Carries only mutable orchestration state that never crosses a behavior boundary. */
export interface RuntimePipelineExecutionState {
	operation: DatabaseOperationAst
}

/** Identifies one Core-owned nested mutation while it uses the ordinary pipeline. */
export interface ActiveNestedWrite {
	readonly coordinator: RuntimeNestedWriteCoordinator
	readonly graph: NestedWriteGraph
	readonly node: NestedWriteObjectNode
}

/** Retains the latest immutable AST for transaction error attribution. */
export const retainExecutionOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	execution: RuntimePipelineExecutionState,
	operation: TOperation,
): TOperation => {
	execution.operation = operation
	return operation
}

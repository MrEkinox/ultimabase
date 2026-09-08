import type { OperationAstNode } from '../../query/operations/contracts.js'

const nestedWriteRootOperations = new WeakSet<object>()

/** Marks only schema-owned singular commands whose public data uses nested syntax. */
export const markNestedWriteRootOperation = <
	const TOperation extends OperationAstNode,
>(
	operation: TOperation,
): TOperation => {
	nestedWriteRootOperations.add(operation)
	return operation
}

/** Keeps transport and bulk-created operation ASTs on their existing flat contract. */
export const isNestedWriteRootOperation = (
	operation: OperationAstNode,
): boolean => nestedWriteRootOperations.has(operation)

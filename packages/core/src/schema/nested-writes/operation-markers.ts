import type { OperationAstNode } from '../../query/operations/contracts.js'
import type { NestedWriteRootCommand } from './contracts.js'

/** Retains developer syntax outside the executable operation AST. */
export interface NestedWriteRootOperationMarker {
	readonly command: NestedWriteRootCommand
	readonly input: Readonly<Record<string, unknown>>
}

const nestedWriteRootOperations = new WeakMap<
	object,
	NestedWriteRootOperationMarker
>()

/** Marks only schema-owned singular commands whose public data uses nested syntax. */
export const markNestedWriteRootOperation = <
	const TOperation extends OperationAstNode,
>(
	operation: TOperation,
	marker: NestedWriteRootOperationMarker,
): TOperation => {
	nestedWriteRootOperations.set(operation, Object.freeze({ ...marker }))
	return operation
}

export const readNestedWriteRootOperation = (
	operation: OperationAstNode,
): NestedWriteRootOperationMarker | undefined =>
	nestedWriteRootOperations.get(operation)

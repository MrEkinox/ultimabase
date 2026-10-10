import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OperationAstNode } from '../../query/operations/contracts.js'
import type { Pointer } from '../relations/pointer.js'
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
	nestedWriteRootOperations.set(operation, immutableRecord(marker))
	return operation
}

export const readNestedWriteRootOperation = (
	operation: OperationAstNode,
): NestedWriteRootOperationMarker | undefined =>
	nestedWriteRootOperations.get(operation)

/** Names one pointer that a collection command links through `connect`. */
export interface LinkTargetMarker {
	readonly field: string
	readonly pointer: Pointer
}

const linkTargetOperations = new WeakMap<object, readonly LinkTargetMarker[]>()

/**
 * Retains the `connect` targets of a collection-command operation, which
 * Runtime checks for visibility before the write (ADR-0308).
 */
export const markLinkTargetOperation = <
	const TOperation extends OperationAstNode,
>(
	operation: TOperation,
	links: readonly LinkTargetMarker[],
): TOperation => {
	if (links.length > 0) {
		linkTargetOperations.set(operation, immutableArray(links))
	}
	return operation
}

export const readLinkTargetOperation = (
	operation: OperationAstNode,
): readonly LinkTargetMarker[] | undefined =>
	linkTargetOperations.get(operation)

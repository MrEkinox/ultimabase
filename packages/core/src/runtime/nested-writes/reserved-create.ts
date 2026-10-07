import type { DatabaseOperationAst } from '../database/contracts.js'

const reservedCreateIds = new WeakMap<object, string>()

/** Retains one framework-owned create identity outside caller-transformable AST data. */
export const retainReservedCreateId = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	id: string,
): TOperation => {
	reservedCreateIds.set(operation, id)
	return operation
}

/** Reads the identity reserved by the nested-write coordinator, when present. */
export const readReservedCreateId = (
	operation: DatabaseOperationAst,
): string | undefined => reservedCreateIds.get(operation)

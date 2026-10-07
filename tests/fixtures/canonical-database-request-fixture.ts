import {
	createDatabasePersistencePlan,
	type DatabaseMutationOperationAst,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'

/** Prepares one direct adapter mutation exactly as Core does before any rewrite. */
export const prepareCanonical = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	transaction: DatabaseTransactionAdapter,
	operation: TOperation,
): Promise<PreparedDatabaseOperation<TOperation>> =>
	transaction.prepare({
		constraints: [],
		operation,
		plan: createDatabasePersistencePlan(operation),
	})

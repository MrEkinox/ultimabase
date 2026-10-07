import {
	createDatabasePersistencePlan,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'

type CanonicalDatabaseRequest<TOperation extends DatabaseOperationAst> = Omit<
	DatabaseOperationRequest<TOperation>,
	'plan'
>

/** Executes one direct adapter request with the canonical Core plan fixture. */
export const execute = <const TOperation extends DatabaseOperationAst>(
	executor: DatabaseOperationExecutor,
	request: CanonicalDatabaseRequest<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> =>
	executor.execute({
		...request,
		plan: createDatabasePersistencePlan(request.operation),
	})

/** Prepares one direct adapter mutation with the canonical Core plan fixture. */
export const prepare = <const TOperation extends DatabaseMutationOperationAst>(
	executor: DatabaseTransactionAdapter,
	request: CanonicalDatabaseRequest<TOperation>,
): Promise<PreparedDatabaseOperation<TOperation>> =>
	executor.prepare({
		...request,
		plan: createDatabasePersistencePlan(request.operation),
	})

import { FrameworkError } from '@ultimabase/core'
import type {
	DatabaseAdapter,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '@ultimabase/runtime'

import type { PostgresDrizzleClient } from './client.js'

/** Marks the explicit boundary that later operation compilers will implement. */
const executePendingOperation = <const TOperation extends DatabaseOperationAst>(
	_client: PostgresDrizzleClient,
	request: DatabaseOperationRequest<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> =>
	Promise.reject(
		new FrameworkError(
			'INTERNAL_ERROR',
			`PostgreSQL operation is not implemented yet: ${request.operation.kind}`,
			{
				publicMessage: 'The database operation is not available.',
				internalDetails: {
					kind: 'postgres-operation-not-implemented',
					operation: request.operation.kind,
				},
			},
		),
	)

/** Retains the Drizzle client until operation compilers populate execution. */
class DrizzlePostgresDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly #client: PostgresDrizzleClient

	constructor(client: PostgresDrizzleClient) {
		this.#client = client
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return executePendingOperation(this.#client, request)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(
			new FrameworkError(
				'TRANSACTION_ERROR',
				'PostgreSQL transactions are not implemented yet.',
				{
					publicMessage: 'Transactions are not available.',
					internalDetails: {
						reason: 'postgres-transactions-not-implemented',
					},
				},
			),
		)
	}
}

/** Creates Runtime's adapter identity around one application-scoped Drizzle client. */
export const createPostgresDatabaseAdapter = (
	client: PostgresDrizzleClient,
): DatabaseAdapter => new DrizzlePostgresDatabaseAdapter(client)

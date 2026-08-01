import { FrameworkError } from '@ultimabase/core'
import type { ExecutableOperationAst } from '@ultimabase/query'
import type {
	DatabaseAdapter,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '@ultimabase/runtime'
import { isPlainRecord } from '@ultimabase/shared'

import type { PostgresDrizzleClient } from './client.js'
import { executePostgresOperation } from './operation-executor.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'

const readOperationSchema = (operation: DatabaseOperationAst): unknown => {
	if (
		'query' in operation &&
		isPlainRecord(operation.query) &&
		isPlainRecord(operation.query.schema) &&
		'definition' in operation.query.schema
	) {
		return operation.query.schema.definition
	}

	if (
		'schema' in operation &&
		isPlainRecord(operation.schema) &&
		'definition' in operation.schema
	) {
		return operation.schema.definition
	}

	return undefined
}

const assertNoAccessConstraints = (request: DatabaseOperationRequest): void => {
	if (request.accessConstraints.length > 0) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'PostgreSQL cannot compile the requested access constraints.',
			{
				publicMessage: 'The database operation is not available.',
				internalDetails: {
					kind: 'postgres-access-constraint-unsupported',
				},
			},
		)
	}
}

/** Binds one private Drizzle client to the application's compiled schemas. */
class DrizzlePostgresDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly #client: PostgresDrizzleClient
	readonly #schemas: PostgresSchemaCatalog

	constructor(client: PostgresDrizzleClient, schemas: PostgresSchemaCatalog) {
		this.#client = client
		this.#schemas = schemas
	}

	async execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		assertNoAccessConstraints(request)
		const schema = this.#schemas.get(readOperationSchema(request.operation))
		// Runtime guarantees the closed Operation AST union before the adapter boundary.
		const operation = request.operation as unknown as ExecutableOperationAst
		const result: unknown = await executePostgresOperation(
			this.#client,
			schema,
			operation,
		)

		// Exhaustive operation dispatch preserves Runtime's discriminant-to-result contract.
		return result as DatabaseOperationResult<TOperation>
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
	schemas: PostgresSchemaCatalog,
): DatabaseAdapter => new DrizzlePostgresDatabaseAdapter(client, schemas)

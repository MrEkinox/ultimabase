import { FrameworkError } from '@ultimabase/core'
import type {
	DatabaseAdapter,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
} from '@ultimabase/runtime'
import { isPlainRecord } from '@ultimabase/shared'

import type { PostgresDrizzleClient } from './client.js'
import type { CompiledPostgresSchema } from '../schema/contracts.js'
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

/** Marks the explicit boundary that later operation compilers will implement. */
const executePendingOperation = <const TOperation extends DatabaseOperationAst>(
	_client: PostgresDrizzleClient,
	_schema: CompiledPostgresSchema,
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
	readonly #schemas: PostgresSchemaCatalog

	constructor(client: PostgresDrizzleClient, schemas: PostgresSchemaCatalog) {
		this.#client = client
		this.#schemas = schemas
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		const schema = this.#schemas.get(readOperationSchema(request.operation))

		return executePendingOperation(this.#client, schema, request)
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

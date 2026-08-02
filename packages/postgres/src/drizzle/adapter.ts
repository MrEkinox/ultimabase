import { FrameworkError } from '@ultimabase/core'
import type { ExecutableOperationAst } from '@ultimabase/core'
import type {
	DatabaseAdapter,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import {
	createPostgresDrizzleClient,
	type PostgresDrizzleClient,
} from './client.js'
import { executePostgresOperation } from './operation-executor.js'
import { preparePostgresMutation } from './prepared-operation.js'
import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { readPostgresDriverCode } from '../connection/driver-error.js'
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

const assertNoConstraints = (request: DatabaseOperationRequest): void => {
	if (request.constraints.length > 0) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'PostgreSQL cannot compile the requested constraints.',
			{
				publicMessage: 'The database operation is not available.',
				internalDetails: {
					kind: 'postgres-constraint-unsupported',
				},
			},
		)
	}
}

type PostgresTransactionPhase = 'begin' | 'commit' | 'rollback'

/** Removes SQL and connection diagnostics from transaction lifecycle failures. */
const createPostgresTransactionError = (
	phase: PostgresTransactionPhase,
	error: unknown,
): FrameworkError<'TRANSACTION_ERROR'> => {
	const driverCode = readPostgresDriverCode(error)

	return new FrameworkError(
		'TRANSACTION_ERROR',
		`PostgreSQL transaction ${phase} failed.`,
		{
			publicMessage: 'The database transaction failed.',
			// Only a failed BEGIN is known not to have committed developer work.
			retryable:
				phase === 'begin' &&
				(driverCode?.startsWith('08') === true ||
					driverCode === '40001' ||
					driverCode === '40P01'),
			internalDetails: {
				kind: 'postgres-transaction-failed',
				phase,
				...(driverCode === undefined ? {} : { driverCode }),
			},
		},
	)
}

/** Prevents structural pool cleanup failures from replacing a known SQL outcome. */
const releasePostgresClient = (
	client: PostgresPoolClient,
	destroy: boolean,
): unknown => {
	try {
		client.release(destroy ? true : undefined)
		return undefined
	} catch (error: unknown) {
		return error
	}
}

/** Executes one request through the client selected by the adapter lifetime. */
const executePostgresRequest = async <
	const TOperation extends DatabaseOperationAst,
>(
	client: PostgresDrizzleClient,
	schemas: PostgresSchemaCatalog,
	request: DatabaseOperationRequest<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	assertNoConstraints(request)
	const schema = schemas.get(readOperationSchema(request.operation))
	// Runtime guarantees the closed Operation AST union before the adapter boundary.
	const operation = request.operation as unknown as ExecutableOperationAst
	const result: unknown = await executePostgresOperation(
		client,
		schema,
		operation,
	)

	// Exhaustive operation dispatch preserves Runtime's discriminant-to-result contract.
	return result as DatabaseOperationResult<TOperation>
}

/** Owns one borrowed client until exactly one finalization path releases it. */
class DrizzlePostgresTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly #client: PostgresPoolClient
	readonly #drizzle: PostgresDrizzleClient
	readonly #schemas: PostgresSchemaCatalog
	#state:
		'active' | 'committing' | 'rollback-required' | 'rolling-back' | 'closed' =
		'active'

	constructor(client: PostgresPoolClient, schemas: PostgresSchemaCatalog) {
		this.#client = client
		this.#drizzle = createPostgresDrizzleClient(client)
		this.#schemas = schemas
	}

	/** Prevents an escaped adapter from issuing work after commit or rollback. */
	#assertActive(): void {
		if (this.#state !== 'active') {
			throw new FrameworkError(
				'TRANSACTION_ERROR',
				'PostgreSQL transaction adapter is no longer active.',
				{
					publicMessage: 'The database transaction is no longer active.',
					internalDetails: {
						kind: 'postgres-transaction-closed',
					},
				},
			)
		}
	}

	/** Allows Runtime's single compensating rollback after a failed commit. */
	#assertRollbackAllowed(): void {
		if (this.#state !== 'active' && this.#state !== 'rollback-required') {
			this.#assertActive()
		}
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.#assertActive()

		return executePostgresRequest(this.#drizzle, this.#schemas, request)
	}

	async prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.#assertActive()
		assertNoConstraints(request)
		const schema = this.#schemas.get(readOperationSchema(request.operation))

		return preparePostgresMutation(
			this.#drizzle,
			schema,
			request.operation,
			() => {
				this.#assertActive()
			},
		)
	}

	async commit(): Promise<void> {
		this.#assertActive()
		this.#state = 'committing'

		try {
			await this.#client.query('COMMIT')
		} catch (error: unknown) {
			// Runtime owns the compensating rollback after a failed commit attempt.
			this.#state = 'rollback-required'
			throw createPostgresTransactionError('commit', error)
		}

		this.#state = 'closed'
		// COMMIT is already confirmed; a custom pool release failure cannot undo it.
		releasePostgresClient(this.#client, false)
	}

	async rollback(): Promise<void> {
		this.#assertRollbackAllowed()
		this.#state = 'rolling-back'
		let failure: FrameworkError<'TRANSACTION_ERROR'> | undefined

		try {
			await this.#client.query('ROLLBACK')
		} catch (error: unknown) {
			failure = createPostgresTransactionError('rollback', error)
		} finally {
			// A rollback attempt is terminal even when PostgreSQL rejects cleanup.
			this.#state = 'closed'
			const releaseFailure = releasePostgresClient(
				this.#client,
				failure !== undefined,
			)

			if (failure === undefined && releaseFailure !== undefined) {
				failure = createPostgresTransactionError('rollback', releaseFailure)
			}
		}

		if (failure !== undefined) {
			throw failure
		}
	}
}

/** Binds one private Drizzle client and transaction pool to compiled schemas. */
class DrizzlePostgresDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly #client: PostgresDrizzleClient
	readonly #pool: PostgresPool
	readonly #schemas: PostgresSchemaCatalog

	constructor(pool: PostgresPool, schemas: PostgresSchemaCatalog) {
		this.#client = createPostgresDrizzleClient(pool)
		this.#pool = pool
		this.#schemas = schemas
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return executePostgresRequest(this.#client, this.#schemas, request)
	}

	async beginTransaction(): Promise<DatabaseTransactionAdapter> {
		let client: PostgresPoolClient

		try {
			client = await this.#pool.connect()
		} catch (error: unknown) {
			throw createPostgresTransactionError('begin', error)
		}

		try {
			await client.query('BEGIN')
		} catch (error: unknown) {
			// A client with an uncertain transaction state must not re-enter the pool.
			releasePostgresClient(client, true)
			throw createPostgresTransactionError('begin', error)
		}

		return new DrizzlePostgresTransactionAdapter(client, this.#schemas)
	}
}

/** Creates Runtime's adapter identity around one application-scoped pool. */
export const createPostgresDatabaseAdapter = (
	pool: PostgresPool,
	schemas: PostgresSchemaCatalog,
): DatabaseAdapter => new DrizzlePostgresDatabaseAdapter(pool, schemas)

import {
	databaseInclusionCapability,
	databasePersistencePlanCapability,
	databasePluginFieldStructuralContainsCapability,
	databasePointerCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	FrameworkError,
	isRelationUpdateExpression,
	registerPrivateStorageAdapter,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type ExecutableOperationAst,
	type PreparedDatabaseOperation,
	type PrivateStorageAdapterCollection,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { and, type SQL } from 'drizzle-orm'

import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { executePostgresPrivateStorage } from '../private-storage/executor.js'
import {
	compilePostgresRowFilter,
	type PostgresRelationPredicateCompiler,
} from '../query/filter-compiler.js'
import { compilePostgresRelationPredicate } from '../query/relation-compiler.js'
import { createPostgresRelationPredicateCompiler } from '../query/relation-predicate-compiler.js'
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	createPostgresDrizzleClient,
	type PostgresDrizzleClient,
} from './client.js'
import { executePostgresOperation } from './operation-executor.js'
import { createPostgresTransactionError } from './operation-error.js'
import { readPostgresPersistenceOperation } from './persistence-plan.js'
import { preparePostgresMutation } from './prepared-operation.js'
import {
	executePostgresRelationalRead,
	readPostgresIncludedValue,
	readPostgresRelationalObjectIdentity,
} from './relational-query-executor.js'

const postgresDatabaseCapabilities = immutableRecord({
	pointers: databasePointerCapability,
	inclusions: databaseInclusionCapability,
	relations: databaseRelationCapability,
	relationPredicates: databaseRelationPredicateCapability,
	pluginFieldStructuralContains:
		databasePluginFieldStructuralContainsCapability,
	persistencePlans: databasePersistencePlanCapability,
})

/** Shares one compiled schema catalog across lifetimes. */
interface PostgresExecutionContext {
	readonly client: PostgresDrizzleClient
	readonly schemas: PostgresSchemaCatalog
}

/** Reads the physical operation and rejects row predicates on INSERT paths. */
const readSupportedOperation = (
	request: DatabaseOperationRequest,
): ExecutableOperationAst => {
	const operation = readPostgresPersistenceOperation(
		request.operation,
		request.plan,
	)

	// A create cannot honor a row restriction, so it must not silently ignore one.
	if (
		request.rowFilter !== undefined &&
		(operation.kind === 'create-one' || operation.kind === 'create-many')
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'PostgreSQL row constraints cannot guard a create operation.',
			{
				publicMessage: 'The database operation is not available.',
				internalDetails: {
					kind: 'postgres-constraint-operation-unsupported',
					operation: operation.kind,
				},
			},
		)
	}

	return operation
}

/** Compiles the protected row filter without exposing it to QueryBuilder behavior. */
const compileRequestConstraint = (
	schema: CompiledPostgresSchema,
	request: DatabaseOperationRequest,
	relationCompiler: PostgresRelationPredicateCompiler,
): SQL | undefined =>
	request.rowFilter === undefined
		? undefined
		: compilePostgresRowFilter(request.rowFilter, schema, relationCompiler)

const createRelationCompiler = (
	{ schemas }: PostgresExecutionContext,
	request: DatabaseOperationRequest,
): PostgresRelationPredicateCompiler =>
	createPostgresRelationPredicateCompiler(
		schemas,
		request.relationPredicates ?? [],
	)

/** Executes one request through the client selected by the adapter lifetime. */
const executePostgresRequest = async <
	const TOperation extends DatabaseOperationAst,
>(
	context: PostgresExecutionContext,
	request: DatabaseOperationRequest<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	const { client, schemas } = context
	const schema = schemas.get(request.plan.target.schema.definition)
	const operation = readSupportedOperation(request)
	let result: unknown

	// Object reads have one compiler, including their ordinary scalar-only form.
	if (
		operation.kind === 'find-many' ||
		operation.kind === 'find-one' ||
		operation.kind === 'get'
	) {
		result = await executePostgresRelationalRead(client, schemas, request)
	} else {
		const relationCompiler = createRelationCompiler(context, request)
		const constraint = compileRequestConstraint(
			schema,
			request,
			relationCompiler,
		)
		let relationPredicate: SQL | undefined

		// A validated to-many traversal applies only to target read operations.
		if (
			request.relation !== undefined &&
			request.operation.kind !== 'update-one'
		) {
			const relation = schemas.getRelation(request.relation)

			if (relation.target !== schema) {
				throw new TypeError(
					'PostgreSQL relation read target does not match its operation schema',
				)
			}

			relationPredicate = compilePostgresRelationPredicate(
				schemas,
				relation,
				request.relation.sourceObjectId,
			)
		}

		result = await executePostgresOperation(
			{
				client,
				constraints: (name) => schemas.describeConstraint(name),
				relationCompiler,
				schema,
			},
			operation,
			and(constraint, relationPredicate),
		)
	}

	// Exhaustive operation dispatch preserves Runtime's discriminant-to-result contract.
	return result as DatabaseOperationResult<TOperation>
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

/** Shares the identity and inclusion lookups retained by relational reads. */
abstract class PostgresRecordReader {
	/** Exposes only identity retained for the exact projected adapter record. */
	readObjectIdentity(record: Readonly<Record<string, unknown>>): unknown {
		return readPostgresRelationalObjectIdentity(record)
	}

	readIncludedValue(
		record: Readonly<Record<string, unknown>>,
		fieldPath: readonly string[],
	) {
		return readPostgresIncludedValue(record, fieldPath)
	}
}

/** Owns one borrowed client until exactly one finalization path releases it. */
class DrizzlePostgresTransactionAdapter
	extends PostgresRecordReader
	implements DatabaseTransactionAdapter
{
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = postgresDatabaseCapabilities
	readonly #client: PostgresPoolClient
	readonly #context: PostgresExecutionContext
	#state:
		'active' | 'committing' | 'rollback-required' | 'rolling-back' | 'closed' =
		'active'

	constructor(client: PostgresPoolClient, schemas: PostgresSchemaCatalog) {
		super()
		this.#client = client
		this.#context = {
			client: createPostgresDrizzleClient(
				client,
				schemas.drizzleRelationDefinitions(),
			),
			schemas,
		}
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				executePrivateStorage: (request) => {
					this.#assertActive()
					return executePostgresPrivateStorage(
						this.#context.client,
						schemas,
						request,
					)
				},
			}),
		)
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

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.#assertActive()

		return executePostgresRequest(this.#context, request)
	}

	async prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.#assertActive()
		const context = this.#context
		const schema = context.schemas.get(request.plan.target.schema.definition)
		const relationCompiler = createRelationCompiler(context, request)
		const constraint = compileRequestConstraint(
			schema,
			request,
			relationCompiler,
		)
		const relationScope = request.relation
		const relation =
			relationScope === undefined
				? undefined
				: context.schemas.getRelation(relationScope)
		// A scalar nested target update uses the edge as a lock predicate; a
		// relation delta instead uses the same scope to select physical edge storage.
		const scopedTargetPredicate =
			relation !== undefined &&
			relationScope !== undefined &&
			request.operation.kind === 'update-one' &&
			'update' in request.operation &&
			!isRelationUpdateExpression(request.operation.update)
				? compilePostgresRelationPredicate(
						context.schemas,
						relation,
						relationScope.sourceObjectId,
						schema.table,
					)
				: undefined

		readSupportedOperation(request)

		return preparePostgresMutation({
			assertActive: () => {
				this.#assertActive()
			},
			client: context.client,
			constraints: (name) => context.schemas.describeConstraint(name),
			compileConstraint: (execution) => {
				if (
					execution.plan.target.schema.definition !==
					request.plan.target.schema.definition
				) {
					throw new TypeError(
						'PostgreSQL prepared plan changed its target schema',
					)
				}

				readSupportedOperation({
					...request,
					operation: execution.operation,
					plan: execution.plan,
				})

				return and(
					compileRequestConstraint(schema, request, relationCompiler),
					scopedTargetPredicate,
				)
			},
			constraint: and(constraint, scopedTargetPredicate),
			operation: request.operation,
			plan: request.plan,
			prepareMutationItems: request.prepareMutationItems === true,
			relation,
			relationCompiler,
			schema,
		})
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
		// Runtime's single compensating rollback is allowed after a failed commit.
		if (this.#state !== 'rollback-required') {
			this.#assertActive()
		}

		this.#state = 'rolling-back'
		let failure: FrameworkError | undefined

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
class DrizzlePostgresDatabaseAdapter
	extends PostgresRecordReader
	implements DatabaseAdapter
{
	readonly kind = 'database-adapter' as const
	readonly capabilities = postgresDatabaseCapabilities
	readonly #context: PostgresExecutionContext
	readonly #pool: PostgresPool

	constructor(pool: PostgresPool, schemas: PostgresSchemaCatalog) {
		super()
		const client = createPostgresDrizzleClient(
			pool,
			schemas.drizzleRelationDefinitions(),
		)

		this.#context = { client, schemas }
		this.#pool = pool
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				configurePrivateStorage: (
					collections: readonly PrivateStorageAdapterCollection[],
				) => {
					schemas.configurePrivateStorage(collections)
				},
				executePrivateStorage: (request) =>
					executePostgresPrivateStorage(client, schemas, request),
			}),
		)
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return executePostgresRequest(this.#context, request)
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

		return new DrizzlePostgresTransactionAdapter(client, this.#context.schemas)
	}
}

/** Creates Runtime's adapter identity around one application-scoped pool. */
export const createPostgresDatabaseAdapter = (
	pool: PostgresPool,
	schemas: PostgresSchemaCatalog,
): DatabaseAdapter => new DrizzlePostgresDatabaseAdapter(pool, schemas)

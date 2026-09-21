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
} from '@ultimabase/core'
import type {
	DatabaseAdapter,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
	PrivateStorageAdapterCollection,
} from '@ultimabase/core'
import { and, type SQL } from 'drizzle-orm'
import { immutableRecord } from '@ultimabase/shared'

import {
	compilePostgresConstraints,
	emptyPostgresConstraintCompilerRegistry,
	type PostgresConstraintCompilerRegistry,
} from '../constraints/compiler.js'
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
import type { PostgresSchemaCatalog } from '../schema/catalog.js'
import { createPostgresTransactionError } from './transaction-error.js'
import { compilePostgresRowFilter } from '../query/filter-compiler.js'
import { compilePostgresRelationPredicate } from '../query/relation-compiler.js'
import { createPostgresRelationPredicateCompiler } from '../query/relation-predicate-compiler.js'
import {
	executePostgresRelationalRead,
	readPostgresIncludedValue,
	readPostgresRelationalObjectIdentity,
} from './relational-query-executor.js'
import { readPostgresPersistenceOperation } from './persistence-plan.js'
import { executePostgresPrivateStorage } from '../private-storage/executor.js'

const postgresTransactionClients = new WeakMap<
	DatabaseTransactionAdapter,
	PostgresPoolClient
>()

const postgresDatabaseCapabilities = immutableRecord({
	pointers: databasePointerCapability,
	inclusions: databaseInclusionCapability,
	relations: databaseRelationCapability,
	relationPredicates: databaseRelationPredicateCapability,
	pluginFieldStructuralContains:
		databasePluginFieldStructuralContainsCapability,
	persistencePlans: databasePersistencePlanCapability,
})

const readPostgresObjectIdentity = (
	record: Readonly<Record<string, unknown>>,
): unknown => readPostgresRelationalObjectIdentity(record)

const isPostgresRelationalRead = (
	operation: ReturnType<typeof readPostgresPersistenceOperation>,
): operation is Extract<
	ReturnType<typeof readPostgresPersistenceOperation>,
	{ readonly kind: 'find-many' | 'find-one' | 'get' }
> =>
	operation.kind === 'find-many' ||
	operation.kind === 'find-one' ||
	operation.kind === 'get'

const readPlanSchema = (request: DatabaseOperationRequest): unknown =>
	request.plan.target.schema.definition

/** Prevents a row predicate from being silently ignored by an INSERT path. */
const assertConstraintOperationSupported = (
	operation: DatabaseOperationAst,
	hasRowRestriction: boolean,
): void => {
	if (
		hasRowRestriction &&
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
}

/** Combines protected constraints and row filters without exposing either to QueryBuilder behavior. */
const compilePostgresRequestConstraint = (
	constraintCompilers: PostgresConstraintCompilerRegistry,
	schema: ReturnType<PostgresSchemaCatalog['get']>,
	request: DatabaseOperationRequest,
	relationCompiler?: ReturnType<typeof createPostgresRelationPredicateCompiler>,
): SQL | undefined => {
	const contributed = compilePostgresConstraints(
		constraintCompilers,
		schema,
		request.constraints,
	)
	const access =
		request.rowFilter === undefined
			? undefined
			: compilePostgresRowFilter(request.rowFilter, schema, relationCompiler)

	return and(contributed, access)
}

/** Adds a validated to-many traversal only to target read operations. */
const compilePostgresRequestRelation = (
	schemas: PostgresSchemaCatalog,
	schema: ReturnType<PostgresSchemaCatalog['get']>,
	request: DatabaseOperationRequest,
): SQL | undefined => {
	if (
		request.relation === undefined ||
		request.operation.kind === 'update-one'
	) {
		return undefined
	}

	const relation = schemas.getRelation(request.relation)

	if (relation.target !== schema) {
		throw new TypeError(
			'PostgreSQL relation read target does not match its operation schema',
		)
	}

	return compilePostgresRelationPredicate(
		schemas,
		relation,
		request.relation.sourceObjectId,
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
	constraintCompilers: PostgresConstraintCompilerRegistry,
	request: DatabaseOperationRequest<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	const schema = schemas.get(readPlanSchema(request))
	const operation = readPostgresPersistenceOperation(
		request.operation,
		request.plan,
	)
	assertConstraintOperationSupported(
		operation,
		request.constraints.length > 0 || request.rowFilter !== undefined,
	)

	// Object reads have one compiler, including their ordinary scalar-only form.
	if (isPostgresRelationalRead(operation)) {
		return (await executePostgresRelationalRead(
			client,
			schemas,
			constraintCompilers,
			request,
		)) as DatabaseOperationResult<TOperation>
	}

	const relationPredicateCompiler = createPostgresRelationPredicateCompiler(
		schemas,
		constraintCompilers,
		request.relationPredicates ?? [],
	)
	const constraintPredicate = compilePostgresRequestConstraint(
		constraintCompilers,
		schema,
		request,
		relationPredicateCompiler,
	)
	const relationPredicate = compilePostgresRequestRelation(
		schemas,
		schema,
		request,
	)
	const effectivePredicate = and(constraintPredicate, relationPredicate)
	// Runtime guarantees the closed Operation AST union before the adapter boundary.
	const result = await executePostgresOperation(
		client,
		schema,
		operation,
		effectivePredicate,
		relationPredicateCompiler,
	)

	// Exhaustive operation dispatch preserves Runtime's discriminant-to-result contract.
	return result as DatabaseOperationResult<TOperation>
}

/** Owns one borrowed client until exactly one finalization path releases it. */
class DrizzlePostgresTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = postgresDatabaseCapabilities
	readonly #client: PostgresPoolClient
	readonly #drizzle: PostgresDrizzleClient
	readonly #schemas: PostgresSchemaCatalog
	readonly #constraintCompilers: PostgresConstraintCompilerRegistry
	#state:
		'active' | 'committing' | 'rollback-required' | 'rolling-back' | 'closed' =
		'active'

	constructor(
		client: PostgresPoolClient,
		schemas: PostgresSchemaCatalog,
		constraintCompilers: PostgresConstraintCompilerRegistry,
	) {
		this.#client = client
		this.#drizzle = createPostgresDrizzleClient(
			client,
			schemas.drizzleRelationDefinitions(),
		)
		this.#schemas = schemas
		this.#constraintCompilers = constraintCompilers
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				executePrivateStorage: (request) => {
					this.#assertActive()
					return executePostgresPrivateStorage(
						this.#drizzle,
						this.#schemas,
						request,
					)
				},
			}),
		)
		postgresTransactionClients.set(this, client)
	}

	/** Exposes only identity retained for the exact projected adapter record. */
	readObjectIdentity(record: Readonly<Record<string, unknown>>): unknown {
		return readPostgresObjectIdentity(record)
	}

	readIncludedValue(
		record: Readonly<Record<string, unknown>>,
		fieldPath: readonly string[],
	) {
		return readPostgresIncludedValue(record, fieldPath)
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

		return executePostgresRequest(
			this.#drizzle,
			this.#schemas,
			this.#constraintCompilers,
			request,
		)
	}

	async prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.#assertActive()
		const schema = this.#schemas.get(readPlanSchema(request))
		const relationPredicateCompiler = createPostgresRelationPredicateCompiler(
			this.#schemas,
			this.#constraintCompilers,
			request.relationPredicates ?? [],
		)
		const constraintPredicate = compilePostgresRequestConstraint(
			this.#constraintCompilers,
			schema,
			request,
			relationPredicateCompiler,
		)
		const relationScope = request.relation
		const relation =
			relationScope === undefined
				? undefined
				: this.#schemas.getRelation(relationScope)
		// A scalar nested target update uses the edge as a lock predicate; a
		// relation delta instead uses the same scope to select physical edge storage.
		const scopedTargetPredicate =
			relation !== undefined &&
			relationScope !== undefined &&
			request.operation.kind === 'update-one' &&
			'update' in request.operation &&
			!isRelationUpdateExpression(request.operation.update)
				? compilePostgresRelationPredicate(
						this.#schemas,
						relation,
						relationScope.sourceObjectId,
						schema.table,
					)
				: undefined
		const initialPhysicalOperation = readPostgresPersistenceOperation(
			request.operation,
			request.plan,
		)
		assertConstraintOperationSupported(
			initialPhysicalOperation,
			request.constraints.length > 0 || request.rowFilter !== undefined,
		)

		return preparePostgresMutation(
			this.#drizzle,
			schema,
			request.operation,
			request.plan,
			and(constraintPredicate, scopedTargetPredicate),
			() => {
				this.#assertActive()
			},
			(execution) => {
				if (
					execution.plan.target.schema.definition !==
					request.plan.target.schema.definition
				) {
					throw new TypeError(
						'PostgreSQL prepared plan changed its target schema',
					)
				}
				const physicalOperation = readPostgresPersistenceOperation(
					execution.operation,
					execution.plan,
				)
				assertConstraintOperationSupported(
					physicalOperation,
					execution.constraints.length > 0 || request.rowFilter !== undefined,
				)

				return and(
					compilePostgresRequestConstraint(
						this.#constraintCompilers,
						schema,
						{
							...request,
							constraints: execution.constraints,
							operation: execution.operation,
							plan: execution.plan,
						},
						relationPredicateCompiler,
					),
					scopedTargetPredicate,
				)
			},
			request.prepareMutationItems === true,
			relation,
			relationPredicateCompiler,
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
		postgresTransactionClients.delete(this)
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
			postgresTransactionClients.delete(this)
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
	readonly capabilities = postgresDatabaseCapabilities
	readonly #client: PostgresDrizzleClient
	readonly #pool: PostgresPool
	readonly #schemas: PostgresSchemaCatalog
	readonly #constraintCompilers: PostgresConstraintCompilerRegistry

	constructor(
		pool: PostgresPool,
		schemas: PostgresSchemaCatalog,
		constraintCompilers: PostgresConstraintCompilerRegistry,
	) {
		this.#client = createPostgresDrizzleClient(
			pool,
			schemas.drizzleRelationDefinitions(),
		)
		this.#pool = pool
		this.#schemas = schemas
		this.#constraintCompilers = constraintCompilers
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				configurePrivateStorage: (
					collections: readonly PrivateStorageAdapterCollection[],
				) => {
					this.#schemas.configurePrivateStorage(collections)
				},
				executePrivateStorage: (request) =>
					executePostgresPrivateStorage(this.#client, this.#schemas, request),
			}),
		)
	}

	/** Exposes only identity retained for the exact projected adapter record. */
	readObjectIdentity(record: Readonly<Record<string, unknown>>): unknown {
		return readPostgresObjectIdentity(record)
	}

	readIncludedValue(
		record: Readonly<Record<string, unknown>>,
		fieldPath: readonly string[],
	) {
		return readPostgresIncludedValue(record, fieldPath)
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return executePostgresRequest(
			this.#client,
			this.#schemas,
			this.#constraintCompilers,
			request,
		)
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

		return new DrizzlePostgresTransactionAdapter(
			client,
			this.#schemas,
			this.#constraintCompilers,
		)
	}
}

/** Creates Runtime's adapter identity around one application-scoped pool. */
export const createPostgresDatabaseAdapter = (
	pool: PostgresPool,
	schemas: PostgresSchemaCatalog,
	constraintCompilers: PostgresConstraintCompilerRegistry = emptyPostgresConstraintCompilerRegistry,
): DatabaseAdapter =>
	new DrizzlePostgresDatabaseAdapter(pool, schemas, constraintCompilers)

/** @internal Resolves only transaction adapters created by this PostgreSQL package. */
export const readPostgresTransactionClient = (
	adapter: DatabaseTransactionAdapter,
): PostgresPoolClient => {
	const client = postgresTransactionClients.get(adapter)
	if (client === undefined) {
		throw new FrameworkError(
			'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			'PostgreSQL raw access received a foreign transaction adapter.',
			{
				publicMessage: 'The requested adapter capability is not available.',
				internalDetails: { reason: 'foreign-postgres-transaction-adapter' },
			},
		)
	}
	return client
}

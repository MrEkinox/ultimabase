import {
	databasePointerCapability,
	databasePointerInclusionCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	FrameworkError,
} from '@ultimabase/core'
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
import { and, type SQL } from 'drizzle-orm'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

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
import {
	createPostgresItemRecovery,
	type PostgresItemRecovery,
} from './item-recovery.js'
import { createPostgresTransactionError } from './transaction-error.js'
import { compilePostgresRowFilter } from '../query/filter-compiler.js'
import { compilePostgresRelationPredicate } from '../query/relation-compiler.js'
import { createPostgresRelationPredicateCompiler } from '../query/relation-predicate-compiler.js'
import {
	executePostgresEagerPointerRequest,
	readPostgresEagerObjectIdentity,
	readPostgresIncludedPointer,
} from './eager-pointer-executor.js'

const postgresObjectIdentities = new WeakMap<object, unknown>()
const postgresDatabaseCapabilities = immutableRecord({
	pointers: databasePointerCapability,
	pointerInclusions: databasePointerInclusionCapability,
	relations: databaseRelationCapability,
	relationPredicates: databaseRelationPredicateCapability,
})

/** Reads explicit public fields from object-returning read terminals only. */
const readPostgresPublicSelection = (
	operation: DatabaseOperationAst,
): readonly string[] | undefined => {
	if (
		operation.kind !== 'find' &&
		operation.kind !== 'first' &&
		operation.kind !== 'get'
	) {
		return undefined
	}

	const candidate: unknown = operation

	if (
		!isPlainRecord(candidate) ||
		!isPlainRecord(candidate.query) ||
		!isPlainRecord(candidate.query.selection) ||
		!isUnknownArray(candidate.query.selection.fields)
	) {
		throw new TypeError('PostgreSQL read operation selection is invalid')
	}

	const fields: string[] = []

	for (const selected of candidate.query.selection.fields) {
		if (!isPlainRecord(selected) || typeof selected.field !== 'string') {
			throw new TypeError('PostgreSQL selected field is invalid')
		}

		fields.push(selected.field)
	}

	return fields.length === 0 ? undefined : immutableArray(fields)
}

/** Removes the privately fetched id while retaining it beside the public record. */
const projectPostgresReadRecord = (
	record: unknown,
	selectedFields: readonly string[] | undefined,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(record)) {
		throw new TypeError('PostgreSQL read result must be a logical record')
	}

	if (!Object.hasOwn(record, 'id')) {
		throw new TypeError('PostgreSQL read result is missing its object identity')
	}

	if (selectedFields === undefined) {
		postgresObjectIdentities.set(record, record.id)

		return record
	}

	const projection: Record<string, unknown> = {}

	for (const field of selectedFields) {
		if (!Object.hasOwn(record, field)) {
			throw new TypeError(
				`PostgreSQL read result is missing selected field: ${field}`,
			)
		}

		projection[field] = record[field]
	}

	const result = immutableRecord(projection)
	postgresObjectIdentities.set(result, record.id)

	return result
}

/** Projects read results only after the adapter captures every decoded identity. */
const projectPostgresReadResult = (
	operation: DatabaseOperationAst,
	result: unknown,
): unknown => {
	const selectedFields = readPostgresPublicSelection(operation)

	if (operation.kind === 'find') {
		if (!isUnknownArray(result)) {
			throw new TypeError('PostgreSQL find result must be an array')
		}

		return immutableArray(
			result.map((record) => projectPostgresReadRecord(record, selectedFields)),
		)
	}

	if (operation.kind === 'first' || operation.kind === 'get') {
		return result === null
			? null
			: projectPostgresReadRecord(result, selectedFields)
	}

	return result
}

const readPostgresObjectIdentity = (
	record: Readonly<Record<string, unknown>>,
): unknown =>
	postgresObjectIdentities.get(record) ??
	readPostgresEagerObjectIdentity(record)

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

/** Combines policy-neutral constraints and native Access without exposing either to Query hooks. */
const compilePostgresRequestConstraint = (
	constraintCompilers: PostgresConstraintCompilerRegistry,
	schema: ReturnType<PostgresSchemaCatalog['get']>,
	request: DatabaseOperationRequest,
): SQL | undefined => {
	const contributed = compilePostgresConstraints(
		constraintCompilers,
		schema,
		request.constraints,
	)
	const access =
		request.rowFilter === undefined
			? undefined
			: compilePostgresRowFilter(request.rowFilter, schema)

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
	const schema = schemas.get(readOperationSchema(request.operation))
	const constraintPredicate = compilePostgresRequestConstraint(
		constraintCompilers,
		schema,
		request,
	)
	const relationPredicate = compilePostgresRequestRelation(
		schemas,
		schema,
		request,
	)
	const effectivePredicate = and(constraintPredicate, relationPredicate)
	const relationPredicateCompiler = createPostgresRelationPredicateCompiler(
		schemas,
		constraintCompilers,
		request.relationPredicates ?? [],
	)
	assertConstraintOperationSupported(
		request.operation,
		request.constraints.length > 0 || request.rowFilter !== undefined,
	)
	// Runtime guarantees the closed Operation AST union before the adapter boundary.
	const operation = request.operation as unknown as ExecutableOperationAst
	const eager =
		request.pointerInclusions !== undefined &&
		request.pointerInclusions.length > 0
	const result: unknown = eager
		? await executePostgresEagerPointerRequest(
				client,
				schemas,
				constraintCompilers,
				request,
			)
		: await executePostgresOperation(
				client,
				schema,
				operation,
				effectivePredicate,
				relationPredicateCompiler,
			)

	// Exhaustive operation dispatch preserves Runtime's discriminant-to-result contract.
	return (
		eager ? result : projectPostgresReadResult(request.operation, result)
	) as DatabaseOperationResult<TOperation>
}

/** Owns one borrowed client until exactly one finalization path releases it. */
class DrizzlePostgresTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = postgresDatabaseCapabilities
	readonly #client: PostgresPoolClient
	readonly #drizzle: PostgresDrizzleClient
	readonly #schemas: PostgresSchemaCatalog
	readonly #constraintCompilers: PostgresConstraintCompilerRegistry
	readonly #itemRecovery: PostgresItemRecovery
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
		this.#itemRecovery = createPostgresItemRecovery(client)
	}

	/** Exposes only identity retained for the exact projected adapter record. */
	readObjectIdentity(record: Readonly<Record<string, unknown>>): unknown {
		return readPostgresObjectIdentity(record)
	}

	readIncludedPointer(
		record: Readonly<Record<string, unknown>>,
		fieldPath: readonly string[],
	) {
		return readPostgresIncludedPointer(record, fieldPath)
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
		const schema = this.#schemas.get(readOperationSchema(request.operation))
		const constraintPredicate = compilePostgresRequestConstraint(
			this.#constraintCompilers,
			schema,
			request,
		)
		const relation =
			request.relation === undefined
				? undefined
				: this.#schemas.getRelation(request.relation)
		const relationPredicateCompiler = createPostgresRelationPredicateCompiler(
			this.#schemas,
			this.#constraintCompilers,
			request.relationPredicates ?? [],
		)
		assertConstraintOperationSupported(
			request.operation,
			request.constraints.length > 0 || request.rowFilter !== undefined,
		)

		return preparePostgresMutation(
			this.#drizzle,
			schema,
			request.operation,
			constraintPredicate,
			this.#itemRecovery,
			() => {
				this.#assertActive()
			},
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
	}

	/** Exposes only identity retained for the exact projected adapter record. */
	readObjectIdentity(record: Readonly<Record<string, unknown>>): unknown {
		return readPostgresObjectIdentity(record)
	}

	readIncludedPointer(
		record: Readonly<Record<string, unknown>>,
		fieldPath: readonly string[],
	) {
		return readPostgresIncludedPointer(record, fieldPath)
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

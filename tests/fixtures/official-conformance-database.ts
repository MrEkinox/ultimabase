import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	databaseRelationCapability,
	plugin,
	getOperationSchema,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationOutcome,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
	type PreparedDatabaseOperationExecution,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

const fixedInstant = '2026-08-20T12:00:00.000Z'

/** Supplies deterministic logical rows without reproducing a database engine. */
export class OfficialConformanceDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
		relations: databaseRelationCapability,
	}
	readonly requests: DatabaseOperationRequest[] = []
	commits = 0
	preparations = 0
	rollbacks = 0
	#nextId = 1

	constructor(
		private readonly rows: ReadonlyMap<
			string,
			readonly Readonly<Record<string, unknown>>[]
		> = new Map(),
		private readonly trace?: string[],
	) {}

	#rowsFor(operation: DatabaseOperationAst) {
		const schema = getOperationSchema(operation)
		if (
			(typeof schema !== 'object' && typeof schema !== 'function') ||
			schema === null ||
			!('className' in schema) ||
			typeof schema.className !== 'string'
		) {
			throw new TypeError('Official conformance operation has no schema class')
		}
		return this.rows.get(schema.className) ?? immutableArray([])
	}

	#executeRead<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): DatabaseOperationResult<TOperation> {
		const rows = this.#rowsFor(request.operation)
		let result: unknown

		switch (request.operation.kind) {
			case 'count':
				result = rows.length
				break
			case 'exists':
				result = rows.length > 0
				break
			case 'find-many':
				result = rows
				break
			case 'find-one':
			case 'get':
				result = rows[0] ?? null
				break
			default:
				throw new TypeError(
					`Official conformance adapter cannot execute ${request.operation.kind} outside a transaction`,
				)
		}

		return result as DatabaseOperationResult<TOperation>
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		return Promise.resolve(this.#executeRead(request))
	}

	#createRecord(operation: DatabaseMutationOperationAst) {
		const input: unknown = isPlainRecord(operation)
			? operation.input
			: undefined
		if (operation.kind !== 'create-one' || !isPlainRecord(input)) {
			throw new TypeError(
				`Official conformance adapter only materializes create-one operations`,
			)
		}

		const id = `019c0000-0000-7000-8000-${String(this.#nextId).padStart(12, '0')}`
		this.#nextId += 1

		return immutableRecord({
			...input,
			createdAt: fixedInstant,
			id,
			updatedAt: fixedInstant,
		})
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction: DatabaseTransactionAdapter = {
			capabilities: this.capabilities,
			kind: 'database-transaction-adapter',
			commit: (): Promise<void> => {
				this.commits += 1
				this.trace?.push('database:commit')
				return Promise.resolve()
			},
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => this.execute(request),
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> => {
				this.preparations += 1
				let attempted = false
				const prepared = {
					...(request.operation.kind === 'update-one'
						? { target: this.#rowsFor(request.operation)[0] ?? null }
						: {}),
					execute: (
						execution?: PreparedDatabaseOperationExecution<TOperation>,
					): Promise<DatabaseOperationOutcome<TOperation>> => {
						if (attempted) {
							throw new TypeError(
								'Official conformance operation was already executed',
							)
						}
						attempted = true
						const operation = execution?.operation ?? request.operation
						const result = this.#createRecord(operation)
						return Promise.resolve({
							materializations: immutableArray([
								immutableRecord({
									current: result,
									kind: 'create' as const,
								}),
							]),
							result,
						} as unknown as DatabaseOperationOutcome<TOperation>)
					},
				}

				return Promise.resolve(
					prepared as unknown as PreparedDatabaseOperation<TOperation>,
				)
			},
			rollback: (): Promise<void> => {
				this.rollbacks += 1
				this.trace?.push('database:rollback')
				return Promise.resolve()
			},
		}

		return Promise.resolve(transaction)
	}
}

/** Installs one public adapter provider with an application-local fixture. */
export const officialConformanceDatabasePlugin = (
	database: OfficialConformanceDatabase,
) =>
	plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'official-conformance-database',
				create: () => ({ value: database }),
			}),
		],
		core: '^0.0.0',
		id: 'fixture.official-conformance-database',
		version: '1.0.0',
	})

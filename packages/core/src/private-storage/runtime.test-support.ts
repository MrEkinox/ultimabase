import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '../runtime/database/contracts.js'
import { FrameworkError } from '../errors/framework-error.js'
import { createPreparedOperationFixture } from '../../tests/runtime/fixtures/recording-database-adapter.js'
import type {
	PrivateStorageAdapterCollection,
	PrivateStorageOperationRequest,
} from './adapter.js'
import { registerPrivateStorageAdapter } from './adapter.js'

// An in-memory adapter with private storage and public create-one, shared by
// the private storage and plugin elevation tests.
type StoredRows = Map<
	PrivateStorageAdapterCollection,
	Readonly<Record<string, unknown>>[]
>

const copyRows = (source: StoredRows): StoredRows =>
	new Map(
		[...source].map(([collection, rows]) => [
			collection,
			rows.map((row) => immutableRecord(row)),
		]),
	)

const matches = (
	record: Readonly<Record<string, unknown>>,
	where: Readonly<Record<string, unknown>>,
): boolean =>
	Object.entries(where).every(([name, value]) => Object.is(record[name], value))

const executeMemoryRequest = (
	rows: StoredRows,
	request: PrivateStorageOperationRequest,
): Readonly<Record<string, unknown>> | null => {
	const records = rows.get(request.collection)
	if (records === undefined)
		throw new TypeError('Private collection is not configured')
	switch (request.kind) {
		case 'find-unique': {
			const index = records.findIndex((record) =>
				matches(record, request.where),
			)
			return index < 0 ? null : (records[index] ?? null)
		}
		case 'insert':
		case 'insert-if-absent': {
			const record = immutableRecord(request.data)
			for (const unique of request.collection.indexes) {
				if (
					records.some((candidate) =>
						unique.fields.every((name) =>
							Object.is(candidate[name], record[name]),
						),
					)
				) {
					if (request.kind === 'insert-if-absent') return null
					throw new FrameworkError('VALIDATION_ERROR', 'Unique conflict')
				}
			}
			records.push(record)
			return record
		}
		case 'update':
		case 'compare-and-swap': {
			const index = records.findIndex((record) =>
				matches(record, request.where),
			)
			if (index < 0) return null
			const current = records[index]
			if (current === undefined) return null
			if (
				request.kind === 'compare-and-swap' &&
				!matches(current, request.expected)
			) {
				return null
			}
			const next = immutableRecord({ ...current, ...request.data })
			records[index] = next
			return next
		}
		case 'delete': {
			const index = records.findIndex((record) =>
				matches(record, request.where),
			)
			if (index < 0) return null
			return records.splice(index, 1)[0] ?? null
		}
	}
}

export class MemoryTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly #rows: StoredRows
	readonly #publicRows: Readonly<Record<string, unknown>>[]
	privateRequests = 0
	publicRequests = 0
	constructor(
		private readonly parent: MemoryPrivateAdapter,
		rows: StoredRows,
		publicRows: readonly Readonly<Record<string, unknown>>[],
	) {
		this.#rows = copyRows(rows)
		this.#publicRows = publicRows.map((row) => immutableRecord(row))
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				executePrivateStorage: (request) => {
					this.privateRequests += 1
					return Promise.resolve(executeMemoryRequest(this.#rows, request))
				},
			}),
		)
	}
	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Public execution is not used by this fixture')
	}
	prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		if (request.operation.kind !== 'create-one') {
			throw new TypeError('Only create-one is supported by this fixture')
		}
		const input: unknown = Reflect.get(request.operation, 'input')
		if (!isPlainRecord(input))
			throw new TypeError('Create input is unavailable')
		const current = immutableRecord({
			...input,
			createdAt: '2026-09-06T00:00:00.000Z',
			id: `0198c000-0000-7000-8000-${String(this.#publicRows.length + 1).padStart(12, '0')}`,
			updatedAt: '2026-09-06T00:00:00.000Z',
		})
		return Promise.resolve(
			createPreparedOperationFixture({
				execute: () => {
					this.publicRequests += 1
					this.#publicRows.push(current)
					// Like a real adapter, answer the selection only (ADR-0341).
					const { fields } = request.plan.returning.selection
					const row: Readonly<Record<string, unknown>> = current
					const result =
						fields.length === 0
							? current
							: immutableRecord(
									Object.fromEntries(
										fields.map(({ field }) => [field, row[field]]),
									),
								)
					return Promise.resolve(result) as unknown as Promise<
						DatabaseOperationResult<TOperation>
					>
				},
				materializations: [{ current, kind: 'create' }] as never,
			}),
		)
	}
	commit(): Promise<void> {
		this.parent.replace(this.#rows, this.#publicRows)
		return Promise.resolve()
	}
	rollback(): Promise<void> {
		return Promise.resolve()
	}
}

export class MemoryPrivateAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}
	readonly configured: PrivateStorageAdapterCollection[] = []
	readonly transactions: MemoryTransaction[] = []
	rootPrivateRequests = 0
	#rows: StoredRows = new Map()
	#publicRows: Readonly<Record<string, unknown>>[] = []
	constructor() {
		registerPrivateStorageAdapter(
			this,
			immutableRecord({
				configurePrivateStorage: (
					collections: readonly PrivateStorageAdapterCollection[],
				) => {
					this.configured.push(...collections)
					this.#rows = new Map(
						collections.map((collection) => [collection, []]),
					)
				},
				executePrivateStorage: (request: PrivateStorageOperationRequest) => {
					this.rootPrivateRequests += 1
					return Promise.resolve(executeMemoryRequest(this.#rows, request))
				},
			}),
		)
	}
	replace(
		rows: StoredRows,
		publicRows: readonly Readonly<Record<string, unknown>>[],
	): void {
		this.#rows = copyRows(rows)
		this.#publicRows = publicRows.map((row) => immutableRecord(row))
	}
	get publicRowCount(): number {
		return this.#publicRows.length
	}
	execute<const TOperation extends DatabaseOperationAst>(): Promise<
		DatabaseOperationResult<TOperation>
	> {
		throw new TypeError('Public execution is not used by this fixture')
	}
	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		const transaction = new MemoryTransaction(
			this,
			this.#rows,
			this.#publicRows,
		)
		this.transactions.push(transaction)
		return Promise.resolve(transaction)
	}
}

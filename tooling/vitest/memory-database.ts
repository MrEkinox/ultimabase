import {
	applyUpdateExpressionToRecord,
	databasePersistencePlanCapability,
	type DatabaseAdapter,
	type DatabaseAdapterCapabilities,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationOutcome,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabasePersistencePlan,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
	type PreparedDatabaseOperationExecution,
	type QuerySelectionNode,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { matchesMemoryFilter, sortMemoryRows } from './memory-database-query.js'

/** Seeds and configures one in-memory test database. */
export interface MemoryTestDatabaseOptions {
	/** Rows per schema class name; ids are kept as given. */
	readonly rows?: Readonly<Record<string, readonly DatabaseLogicalRecord[]>>
	/** Defaults to the persistence-plan protocol only. */
	readonly capabilities?: DatabaseAdapterCapabilities
	/** Receives `database:commit` and `database:rollback`. */
	readonly trace?: string[]
	/** The `createdAt`/`updatedAt` value of written rows. */
	readonly now?: string
}

type Tables = Map<string, readonly DatabaseLogicalRecord[]>

const defaultCapabilities: DatabaseAdapterCapabilities = Object.freeze({
	persistencePlans: databasePersistencePlanCapability,
})

const unsupported = (feature: string): TypeError =>
	new TypeError(`MemoryTestDatabase does not support ${feature}`)

const classNameOf = (plan: DatabasePersistencePlan): string =>
	plan.target.schema.definition.className

/** Reads keep `id` beside the selection, as Runtime strips it afterwards. */
const projectRead = (
	row: DatabaseLogicalRecord,
	selection: QuerySelectionNode,
): DatabaseLogicalRecord => {
	if (selection.fields.length === 0) return row
	const fields = selection.fields.map(({ field }) => field)
	return immutableRecord(
		Object.fromEntries(
			(fields.includes('id') ? fields : [...fields, 'id'])
				.filter((field) => Object.hasOwn(row, field))
				.map((field) => [field, row[field]]),
		),
	)
}

/** Writes answer exactly their selection; an empty one answers the row. */
const projectWrite = (
	row: DatabaseLogicalRecord,
	selection: QuerySelectionNode,
): DatabaseLogicalRecord =>
	selection.fields.length === 0
		? row
		: immutableRecord(
				Object.fromEntries(
					selection.fields.map(({ field }) => {
						if (!Object.hasOwn(row, field)) {
							throw new TypeError(`Written row has no field ${field}`)
						}
						return [field, row[field]]
					}),
				),
			)

const assertPortableRequest = (request: DatabaseOperationRequest): void => {
	if (request.relation !== undefined) throw unsupported('relation scopes')
	if ((request.relationPredicates?.length ?? 0) > 0) {
		throw unsupported('relation predicates')
	}
	if ((request.inclusions?.length ?? 0) > 0) throw unsupported('inclusions')
}

/** Selects the rows a query-shaped plan targets, in query order. */
const selectRows = (
	tables: Tables,
	request: DatabaseOperationRequest,
	plan: DatabasePersistencePlan,
): readonly DatabaseLogicalRecord[] => {
	assertPortableRequest(request)
	const rows = tables.get(classNameOf(plan)) ?? []
	if (!('query' in plan.data)) return rows
	const { query } = plan.data
	const id = 'id' in plan.data ? plan.data.id : undefined
	const matching = rows.filter(
		(row) =>
			(id === undefined || row.id === id) &&
			(query.where === undefined ||
				matchesMemoryFilter(query.where.expression, row)) &&
			(request.rowFilter === undefined ||
				matchesMemoryFilter(request.rowFilter, row)),
	)
	const skip = query.pagination?.skip ?? 0
	return sortMemoryRows(matching, query.ordering.orders).slice(
		skip,
		query.take === undefined ? undefined : skip + query.take,
	)
}

const read = (tables: Tables, request: DatabaseOperationRequest): unknown => {
	const { plan } = request
	const { selection } = plan.returning
	switch (plan.kind) {
		case 'count':
			return selectRows(tables, request, plan).length
		case 'exists':
			return selectRows(tables, request, plan).length > 0
		case 'find-many':
			return immutableArray(
				selectRows(tables, request, plan).map((row) =>
					projectRead(row, selection),
				),
			)
		case 'find-one':
		case 'get': {
			const [row] = selectRows(tables, request, plan)
			return row === undefined ? null : projectRead(row, selection)
		}
		default:
			throw new TypeError(
				`MemoryTestDatabase writes ${plan.kind} in a transaction`,
			)
	}
}

/**
 * Stores rows per schema class and answers each operation like a real adapter.
 *
 * Reads honour filters (logical nodes and scalar leaves), row filters,
 * ordering, pagination and the selection; writes run in transactions that
 * apply on commit and answer exactly the selected fields (ADR-0341). Relation
 * scopes, relation predicates, inclusions, upserts and nested filter paths are
 * refused loudly rather than approximated.
 */
export class MemoryTestDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities: DatabaseAdapterCapabilities
	readonly checkHealth = (): Promise<void> => Promise.resolve()
	readonly requests: DatabaseOperationRequest[] = []
	commits = 0
	preparations = 0
	rollbacks = 0
	#tables: Tables
	#nextId = 1
	readonly #options: MemoryTestDatabaseOptions

	constructor(options: MemoryTestDatabaseOptions = {}) {
		this.#options = options
		this.capabilities = options.capabilities ?? defaultCapabilities
		this.#tables = new Map(
			Object.entries(options.rows ?? {}).map(([className, rows]) => [
				className,
				immutableArray(rows.map((row) => immutableRecord(row))),
			]),
		)
	}

	/** Lists the committed rows of one schema class. */
	rows(className: string): readonly DatabaseLogicalRecord[] {
		return this.#tables.get(className) ?? []
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return this.executeOn(this.#tables, request)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.resolve(
			new MemoryTestTransaction(this, new Map(this.#tables)),
		)
	}

	/** @internal Shared by root and transaction reads. */
	async executeOn<const TOperation extends DatabaseOperationAst>(
		tables: Tables,
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		await Promise.resolve()
		// `read` answers the shape `request.plan.kind` selects.
		return read(tables, request) as DatabaseOperationResult<TOperation>
	}

	/** @internal Applies one committed transaction. */
	commit(tables: Tables): void {
		this.#tables = tables
		this.commits += 1
		this.#options.trace?.push('database:commit')
	}

	/** @internal Records one rolled-back transaction. */
	rollback(): void {
		this.rollbacks += 1
		this.#options.trace?.push('database:rollback')
	}

	/** @internal Creates one complete row from a create input. */
	createRow(input: Readonly<Record<string, unknown>>): DatabaseLogicalRecord {
		const id = `019c0000-0000-7000-8000-${String(this.#nextId).padStart(12, '0')}`
		this.#nextId += 1
		return immutableRecord({
			...input,
			createdAt: this.now,
			id,
			updatedAt: this.now,
		})
	}

	get now(): string {
		return this.#options.now ?? '2026-08-20T12:00:00.000Z'
	}
}

interface Outcome {
	readonly materializations: readonly DatabaseMutationMaterialization[]
	readonly result: unknown
}

/** Stages writes on a private copy of the tables until commit. */
class MemoryTestTransaction implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities: DatabaseAdapterCapabilities
	readonly #database: MemoryTestDatabase
	readonly #tables: Tables

	constructor(database: MemoryTestDatabase, tables: Tables) {
		this.#database = database
		this.#tables = tables
		this.capabilities = database.capabilities
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return this.#database.executeOn(this.#tables, request)
	}

	async prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.#database.requests.push(request)
		this.#database.preparations += 1
		await Promise.resolve()
		const { plan } = request
		const single =
			plan.kind === 'update-one' ||
			plan.kind === 'delete-one' ||
			plan.kind === 'upsert-one'
		const targets =
			plan.kind === 'create-one' || plan.kind === 'create-many'
				? []
				: selectRows(this.#tables, request, plan)
		const target = targets[0] ?? null
		let attempted = false
		const execute = async (
			execution?: PreparedDatabaseOperationExecution<TOperation>,
		): Promise<DatabaseOperationOutcome<TOperation>> => {
			if (attempted) {
				throw new TypeError('Prepared database operation is already executed')
			}
			attempted = true
			await Promise.resolve()
			const outcome = this.#write(
				execution?.plan ?? plan,
				single ? (target === null ? [] : [target]) : targets,
			)
			// `#write` answers the outcome shape `plan.kind` selects.
			return outcome as unknown as DatabaseOperationOutcome<TOperation>
		}
		const prepared = {
			execute,
			...(single ? { target } : {}),
			...(request.prepareMutationItems === true && !single
				? { targets: immutableArray(targets) }
				: {}),
		}
		// The handle carries the target fields its operation kind declares.
		return prepared as unknown as PreparedDatabaseOperation<TOperation>
	}

	commit(): Promise<void> {
		this.#database.commit(this.#tables)
		return Promise.resolve()
	}

	rollback(): Promise<void> {
		this.#database.rollback()
		return Promise.resolve()
	}

	#write(
		plan: DatabasePersistencePlan,
		targets: readonly DatabaseLogicalRecord[],
	): Outcome {
		const className = classNameOf(plan)
		const rows = this.#tables.get(className) ?? []
		const { selection } = plan.returning
		const answer = (
			written: readonly DatabaseLogicalRecord[],
			materializations: readonly DatabaseMutationMaterialization[],
			many: boolean,
		): Outcome => ({
			materializations: immutableArray(materializations),
			result: many
				? immutableArray(written.map((row) => projectWrite(row, selection)))
				: written[0] === undefined
					? null
					: projectWrite(written[0], selection),
		})
		switch (plan.kind) {
			case 'create-one':
			case 'create-many': {
				const created = (
					plan.kind === 'create-one' ? [plan.data.input] : plan.data.inputs
				).map((input) => this.#database.createRow(input))
				this.#tables.set(className, immutableArray([...rows, ...created]))
				return answer(
					created,
					created.map((current) =>
						immutableRecord({ current, kind: 'create' }),
					),
					plan.kind === 'create-many',
				)
			}
			case 'update-one':
			case 'update-many': {
				const { update } = plan.data
				const schema = plan.target.schema.definition
				const updates = new Map(
					targets.map((previous) => [
						previous.id,
						immutableRecord({
							...applyUpdateExpressionToRecord(schema, previous, update),
							updatedAt: this.#database.now,
						}),
					]),
				)
				this.#tables.set(
					className,
					immutableArray(rows.map((row) => updates.get(row.id) ?? row)),
				)
				const current = targets.flatMap((previous) => {
					const next = updates.get(previous.id)
					return next === undefined ? [] : [{ current: next, previous }]
				})
				return answer(
					current.map((pair) => pair.current),
					current.map(({ current: next, previous }) =>
						immutableRecord({ current: next, kind: 'update', previous }),
					),
					plan.kind === 'update-many',
				)
			}
			case 'delete-one':
			case 'delete-many': {
				const removed = new Set(targets.map((row) => row.id))
				this.#tables.set(
					className,
					immutableArray(rows.filter((row) => !removed.has(row.id))),
				)
				return answer(
					targets,
					targets.map((previous) =>
						immutableRecord({ kind: 'delete', previous }),
					),
					plan.kind === 'delete-many',
				)
			}
			default:
				throw unsupported(plan.kind)
		}
	}
}

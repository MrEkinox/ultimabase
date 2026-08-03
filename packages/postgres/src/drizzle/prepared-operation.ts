import {
	FrameworkError,
	type QueryAst,
	type UniqueUpsertTargetNode,
	type UpdateExpressionNode,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabaseOperationOutcome,
	type ExecutableOperationAst,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { and, eq, type SQL } from 'drizzle-orm'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import {
	executeCreateOne,
	executeCreateInput,
	executeCreateMany,
	executeDeleteMany,
	executeUpdateMany,
	lockPostgresSingularMutationTarget,
	lockPostgresUpsertTarget,
	readBuiltInQuery,
	tryCreatePostgresUpsert,
} from './operation-executor.js'
import type { PostgresDrizzleClient } from './client.js'
import type { PostgresItemRecovery } from './item-recovery.js'
import { mapPostgresOperationError } from './operation-error.js'
import { decodePostgresRecord } from './record-codec.js'
import { compilePostgresUpdate } from './update-compiler.js'

type RuntimeMutationOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: DatabaseMutationOperationAst['kind'] }
>
type RuntimeLockedOperation = Extract<
	RuntimeMutationOperation,
	{ readonly kind: 'delete-one' | 'update-one' }
>
type RuntimeProjectedMutation = Extract<
	RuntimeMutationOperation,
	{ readonly kind: 'delete-one' | 'update-one' | 'upsert-one' }
>

interface RuntimeUpsertItem {
	readonly create: Readonly<Record<string, unknown>>
	readonly query: QueryAst
	readonly target: UniqueUpsertTargetNode
	readonly update: UpdateExpressionNode
}

interface PersistedMutationItem {
	readonly materialization: DatabaseMutationMaterialization
	readonly record: DatabaseLogicalRecord
}
type PreparedMutationExecution<
	TOperation extends DatabaseMutationOperationAst,
> = () => Promise<DatabaseOperationOutcome<TOperation>>

interface PreparedMutationHandleOptions<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly assertActive: () => void
	readonly target?: DatabaseLogicalRecord | null
	readonly execute: PreparedMutationExecution<TOperation>
}

/** Centralizes the adapter's discriminant-safe logical outcome boundary. */
const createPostgresMutationOutcome = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	result: unknown,
	materializations: readonly DatabaseMutationMaterialization[],
): DatabaseOperationOutcome<TOperation> =>
	immutableRecord({
		materializations: immutableArray(materializations),
		result,
	}) as unknown as DatabaseOperationOutcome<TOperation>

/** Creates one transaction-bound handle that consumes its target on first use. */
const createPreparedMutationHandle = <
	const TOperation extends DatabaseMutationOperationAst,
>({
	assertActive,
	target,
	execute,
}: PreparedMutationHandleOptions<TOperation>): PreparedDatabaseOperation<TOperation> => {
	let attempted = false
	const handle = {
		...(target === undefined ? {} : { target }),
		execute: async (): Promise<DatabaseOperationOutcome<TOperation>> => {
			if (attempted) {
				throw new TypeError(
					'PostgreSQL prepared mutation has already been executed',
				)
			}

			// Failed and expired attempts consume the retained target as well.
			attempted = true
			assertActive()

			return execute()
		},
	}

	// Runtime narrowing restores the exact conditional target contract.
	return Object.freeze(
		handle,
	) as unknown as PreparedDatabaseOperation<TOperation>
}

/** Reuses PostgreSQL error sanitization for preparation and execution steps. */
const runPreparedMutationStep = async <TResult>(
	kind: RuntimeMutationOperation['kind'],
	run: () => Promise<TResult>,
): Promise<TResult> => {
	try {
		return await run()
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, kind)
	}
}

/** Keeps full private records separate from the public Query projection. */
const projectPostgresRecord = (
	record: DatabaseLogicalRecord,
	operation: RuntimeProjectedMutation,
): DatabaseLogicalRecord => {
	const query = readBuiltInQuery(operation.query)

	if (query.selection.fields.length === 0) {
		return record
	}

	const projection: Record<string, unknown> = {}

	for (const { field } of query.selection.fields) {
		if (!Object.hasOwn(record, field)) {
			throw new TypeError(
				`PostgreSQL prepared mutation result is missing selected field: ${field}`,
			)
		}

		projection[field] = record[field]
	}

	return immutableRecord(projection)
}

const readPreparedRecordId = (
	schema: CompiledPostgresSchema,
	record: DatabaseLogicalRecord,
): unknown => {
	if (!Object.hasOwn(record, 'id')) {
		throw new TypeError('PostgreSQL prepared mutation target is missing its id')
	}

	return resolveCompiledPostgresField(schema, 'id').codec.encode(record.id)
}

/** Reuses one retained identifier while preserving every accumulated constraint. */
const createRetainedMutationTarget = (
	schema: CompiledPostgresSchema,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): SQL => {
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = and(eq(id, readPreparedRecordId(schema, previous)), constraint)

	if (target === undefined) {
		throw new TypeError(
			'PostgreSQL prepared mutation predicate could not be combined',
		)
	}

	return target
}

/** Applies an update to one locked row and returns its complete current state. */
const executeRetainedUpdate = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	update: UpdateExpressionNode,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): Promise<DatabaseLogicalRecord> => {
	const [row] = await client
		.update(schema.table)
		.set(compilePostgresUpdate(schema, update))
		.where(createRetainedMutationTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))

	if (row === undefined) {
		throw new TypeError(
			'PostgreSQL prepared update target disappeared before execution',
		)
	}

	return decodePostgresRecord(schema, row)
}

const executeLockedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): Promise<
	Readonly<{
		materialization: DatabaseMutationMaterialization
		record: DatabaseLogicalRecord
	}>
> => {
	if (operation.kind === 'update-one') {
		const current = await executeRetainedUpdate(
			client,
			schema,
			operation.update,
			previous,
			constraint,
		)

		return immutableRecord({
			materialization: immutableRecord({
				current,
				kind: 'update' as const,
				previous,
			}),
			record: current,
		})
	}

	const [row] = await client
		.delete(schema.table)
		.where(createRetainedMutationTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))

	if (row === undefined) {
		throw new TypeError(
			'PostgreSQL prepared delete target disappeared before execution',
		)
	}

	const removed = decodePostgresRecord(schema, row)

	return immutableRecord({
		materialization: immutableRecord({
			kind: 'delete' as const,
			previous: removed,
		}),
		record: removed,
	})
}

/** Resolves one upsert branch without guessing from a speculative pre-read. */
const executeUpsertItem = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	item: RuntimeUpsertItem,
	constraint: SQL | undefined,
): Promise<PersistedMutationItem> => {
	let previous = await lockPostgresUpsertTarget(
		client,
		schema,
		item.query,
		constraint,
	)

	if (previous === null) {
		const created = await tryCreatePostgresUpsert(
			client,
			schema,
			item.create,
			item.target,
		)

		if (created !== null) {
			return immutableRecord({
				materialization: immutableRecord({
					current: created,
					kind: 'create' as const,
				}),
				record: created,
			})
		}

		// A concurrent insert may win after the initial absent-target snapshot.
		previous = await lockPostgresUpsertTarget(
			client,
			schema,
			item.query,
			constraint,
		)
	}

	if (previous === null) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'PostgreSQL upsert conflict is outside the permitted target.',
			{
				publicMessage: 'The operation violates a data constraint.',
				internalDetails: { kind: 'postgres-upsert-target-inaccessible' },
			},
		)
	}

	const current = await executeRetainedUpdate(
		client,
		schema,
		item.update,
		previous,
		constraint,
	)

	return immutableRecord({
		materialization: immutableRecord({
			current,
			kind: 'update' as const,
			previous,
		}),
		record: current,
	})
}

interface OrderedCollectionExecution {
	readonly materializations: readonly DatabaseMutationMaterialization[]
	readonly result: unknown
}

/** Executes recoverable items in order and stops after the first failed savepoint. */
const executeNonAtomicCollection = async <TItem>(
	kind: 'create-many' | 'upsert-many',
	items: readonly TItem[],
	recovery: PostgresItemRecovery,
	persist: (item: TItem) => Promise<PersistedMutationItem>,
): Promise<OrderedCollectionExecution> => {
	const records: DatabaseLogicalRecord[] = []
	const materializations: DatabaseMutationMaterialization[] = []

	for (const [index, item] of items.entries()) {
		const attempt = await recovery.attempt(() =>
			runPreparedMutationStep(kind, () => persist(item)),
		)

		if (attempt.status === 'failed') {
			return immutableRecord({
				materializations: immutableArray(materializations),
				result: immutableRecord({
					error: attempt.error,
					failedIndex: index,
					results: immutableArray(records),
					status: 'stopped' as const,
				}),
			})
		}

		records.push(attempt.value.record)
		materializations.push(attempt.value.materialization)
	}

	return immutableRecord({
		materializations: immutableArray(materializations),
		result: immutableRecord({
			results: immutableArray(records),
			status: 'completed' as const,
		}),
	})
}

const prepareCreateOne = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeMutationOperation, { readonly kind: 'create-one' }>,
	assertActive: () => void,
): PreparedDatabaseOperation<DatabaseMutationOperationAst> =>
	createPreparedMutationHandle({
		assertActive,
		execute: async () => {
			const current = await runPreparedMutationStep(operation.kind, () =>
				executeCreateOne(client, schema, operation),
			)

			return createPostgresMutationOutcome(current, [
				immutableRecord({ current, kind: 'create' as const }),
			])
		},
	})

const prepareCreateMany = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'create-many' }
	>,
	recovery: PostgresItemRecovery,
	assertActive: () => void,
): PreparedDatabaseOperation<DatabaseMutationOperationAst> =>
	createPreparedMutationHandle({
		assertActive,
		execute: async () => {
			if (operation.options.atomic) {
				const records = await runPreparedMutationStep(operation.kind, () =>
					executeCreateMany(client, schema, operation),
				)
				const materializations = records.map((current) =>
					immutableRecord({ current, kind: 'create' as const }),
				)

				return createPostgresMutationOutcome(records, materializations)
			}

			const execution = await executeNonAtomicCollection(
				operation.kind,
				operation.inputs,
				recovery,
				async (input) => {
					const current = await executeCreateInput(client, schema, input)

					return immutableRecord({
						materialization: immutableRecord({
							current,
							kind: 'create' as const,
						}),
						record: current,
					})
				},
			)

			return createPostgresMutationOutcome(
				execution.result,
				execution.materializations,
			)
		},
	})

const prepareLockedSingular = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	constraint: SQL | undefined,
	assertActive: () => void,
): Promise<PreparedDatabaseOperation<DatabaseMutationOperationAst>> => {
	const previous = await runPreparedMutationStep(operation.kind, () =>
		lockPostgresSingularMutationTarget(client, schema, operation, constraint),
	)

	return createPreparedMutationHandle({
		assertActive,
		target: previous,
		execute: async () => {
			if (previous === null) {
				return createPostgresMutationOutcome(null, [])
			}

			const { materialization, record } = await runPreparedMutationStep(
				operation.kind,
				() =>
					executeLockedMutation(
						client,
						schema,
						operation,
						previous,
						constraint,
					),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(record, operation),
				[materialization],
			)
		},
	})
}

const prepareSetBasedMutation = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'delete-many' | 'update-many' }
	>,
	constraint: SQL | undefined,
	assertActive: () => void,
): PreparedDatabaseOperation<DatabaseMutationOperationAst> =>
	createPreparedMutationHandle({
		assertActive,
		execute: async () => {
			const result = await runPreparedMutationStep(operation.kind, () =>
				operation.kind === 'update-many'
					? executeUpdateMany(client, schema, operation, constraint)
					: executeDeleteMany(client, schema, operation, constraint),
			)

			return createPostgresMutationOutcome(result, [])
		},
	})

const prepareUpsertOne = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeMutationOperation, { readonly kind: 'upsert-one' }>,
	constraint: SQL | undefined,
	assertActive: () => void,
): PreparedDatabaseOperation<DatabaseMutationOperationAst> =>
	createPreparedMutationHandle({
		assertActive,
		execute: async () => {
			const persisted = await runPreparedMutationStep(operation.kind, () =>
				executeUpsertItem(client, schema, operation, constraint),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(persisted.record, operation),
				[persisted.materialization],
			)
		},
	})

const prepareUpsertMany = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'upsert-many' }
	>,
	constraint: SQL | undefined,
	recovery: PostgresItemRecovery,
	assertActive: () => void,
): PreparedDatabaseOperation<DatabaseMutationOperationAst> =>
	createPreparedMutationHandle({
		assertActive,
		execute: async () => {
			const items = operation.items as readonly RuntimeUpsertItem[]

			if (!operation.options.atomic) {
				const execution = await executeNonAtomicCollection(
					operation.kind,
					items,
					recovery,
					(item) => executeUpsertItem(client, schema, item, constraint),
				)

				return createPostgresMutationOutcome(
					execution.result,
					execution.materializations,
				)
			}

			const records: DatabaseLogicalRecord[] = []
			const materializations: DatabaseMutationMaterialization[] = []

			for (const item of items) {
				const persisted = await runPreparedMutationStep(operation.kind, () =>
					executeUpsertItem(client, schema, item, constraint),
				)
				records.push(persisted.record)
				materializations.push(persisted.materialization)
			}

			return createPostgresMutationOutcome(
				immutableArray(records),
				materializations,
			)
		},
	})

/**
 * Prepares one mutation inside its existing PostgreSQL transaction.
 *
 * Every branch retains ordered private materializations without exposing them
 * through the developer's selected public result.
 */
export const preparePostgresMutation = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: TOperation,
	constraint: SQL | undefined,
	recovery: PostgresItemRecovery,
	assertActive: () => void,
): Promise<PreparedDatabaseOperation<TOperation>> => {
	const runtimeOperation = operation as unknown as RuntimeMutationOperation
	let prepared: PreparedDatabaseOperation<DatabaseMutationOperationAst>

	switch (runtimeOperation.kind) {
		case 'create-one':
			prepared = prepareCreateOne(
				client,
				schema,
				runtimeOperation,
				assertActive,
			)
			break
		case 'create-many':
			prepared = prepareCreateMany(
				client,
				schema,
				runtimeOperation,
				recovery,
				assertActive,
			)
			break
		case 'delete-one':
		case 'update-one':
			prepared = await prepareLockedSingular(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
			)
			break
		case 'delete-many':
		case 'update-many':
			prepared = prepareSetBasedMutation(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
			)
			break
		case 'upsert-one':
			prepared = prepareUpsertOne(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
			)
			break
		case 'upsert-many':
			prepared = prepareUpsertMany(
				client,
				schema,
				runtimeOperation,
				constraint,
				recovery,
				assertActive,
			)
			break
	}

	// The exhaustive switch preserves the incoming operation discriminant.
	return prepared as unknown as PreparedDatabaseOperation<TOperation>
}

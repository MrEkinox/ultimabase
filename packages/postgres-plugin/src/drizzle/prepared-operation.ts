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
import { and, eq, inArray, type SQL } from 'drizzle-orm'

import type {
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import {
	executeCreateInput,
	executeCreateMany,
	executeDeleteMany,
	executeUpdateMany,
	lockPostgresSetBasedMutationTargets,
	lockPostgresSingularMutationTarget,
	lockPostgresUpsertTarget,
	tryCreatePostgresUpsert,
} from './operation-executor.js'
import type { PostgresDrizzleClient } from './client.js'
import { mapPostgresOperationError } from './operation-error.js'
import { readPostgresRecord } from './record.js'
import { compilePostgresUpdate } from './update-compiler.js'
import { executePostgresRelationMutation } from './relation-executor.js'
import type { PostgresRelationPredicateCompiler } from '../query/filter-compiler.js'
import {
	projectPostgresRecord,
	projectPostgresRecords,
} from './result-projection.js'

type RuntimeMutationOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: DatabaseMutationOperationAst['kind'] }
>
type RuntimeLockedOperation = Extract<
	RuntimeMutationOperation,
	{ readonly kind: 'delete-one' | 'update-one' }
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
> = (operation: TOperation) => Promise<DatabaseOperationOutcome<TOperation>>

interface PreparedMutationHandleOptions<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly assertActive: () => void
	readonly operation: TOperation
	readonly target?: DatabaseLogicalRecord | null
	readonly targets?: readonly DatabaseLogicalRecord[]
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
	operation,
	target,
	targets,
	execute,
}: PreparedMutationHandleOptions<TOperation>): PreparedDatabaseOperation<TOperation> => {
	let attempted = false
	const handle = {
		...(target === undefined ? {} : { target }),
		...(targets === undefined ? {} : { targets: immutableArray(targets) }),
		execute: async (
			replacement: TOperation = operation,
		): Promise<DatabaseOperationOutcome<TOperation>> => {
			if (attempted) {
				throw new TypeError(
					'PostgreSQL prepared mutation has already been executed',
				)
			}

			// Failed and expired attempts consume the retained target as well.
			attempted = true
			assertActive()

			return execute(replacement)
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

const readPreparedRecordId = (
	schema: CompiledPostgresSchema,
	record: DatabaseLogicalRecord,
): unknown => {
	if (!Object.hasOwn(record, 'id')) {
		throw new TypeError('PostgreSQL prepared mutation target is missing its id')
	}

	resolveCompiledPostgresField(schema, 'id')
	return record.id
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

	return readPostgresRecord(schema, row)
}

const executeLockedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
	relation: CompiledPostgresRelation | undefined,
): Promise<
	Readonly<{
		materialization: DatabaseMutationMaterialization
		record: DatabaseLogicalRecord
	}>
> => {
	if (operation.kind === 'update-one') {
		if (relation !== undefined) {
			await executePostgresRelationMutation(
				client,
				relation,
				operation.update,
				previous.id,
			)
		}

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

	const removed = readPostgresRecord(schema, row)

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
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<PersistedMutationItem> => {
	let previous = await lockPostgresUpsertTarget(
		client,
		schema,
		item.query,
		constraint,
		relationCompiler,
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
			relationCompiler,
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

const prepareCreateOne = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeMutationOperation, { readonly kind: 'create-one' }>,
	assertActive: () => void,
): PreparedDatabaseOperation<
	Extract<RuntimeMutationOperation, { readonly kind: 'create-one' }>
> =>
	createPreparedMutationHandle({
		assertActive,
		operation,
		execute: async (resolvedOperation) => {
			const current = await runPreparedMutationStep(
				resolvedOperation.kind,
				() => executeCreateInput(client, schema, resolvedOperation.input),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(current, resolvedOperation),
				[immutableRecord({ current, kind: 'create' as const })],
			)
		},
	})

const prepareCreateMany = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'create-many' }
	>,
	assertActive: () => void,
): PreparedDatabaseOperation<
	Extract<RuntimeMutationOperation, { readonly kind: 'create-many' }>
> =>
	createPreparedMutationHandle({
		assertActive,
		operation,
		execute: async (resolvedOperation) => {
			const records = await runPreparedMutationStep(
				resolvedOperation.kind,
				() => executeCreateMany(client, schema, resolvedOperation),
			)
			const materializations = records.map((current) =>
				immutableRecord({ current, kind: 'create' as const }),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecords(records, resolvedOperation),
				materializations,
			)
		},
	})

const prepareLockedSingular = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	constraint: SQL | undefined,
	assertActive: () => void,
	relation: CompiledPostgresRelation | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<PreparedDatabaseOperation<RuntimeLockedOperation>> => {
	const previous = await runPreparedMutationStep(operation.kind, () =>
		lockPostgresSingularMutationTarget(
			client,
			schema,
			operation,
			constraint,
			relationCompiler,
		),
	)

	return createPreparedMutationHandle({
		assertActive,
		operation,
		target: previous,
		execute: async (resolvedOperation) => {
			if (previous === null) {
				return createPostgresMutationOutcome(null, [])
			}

			const { materialization, record } = await runPreparedMutationStep(
				resolvedOperation.kind,
				() =>
					executeLockedMutation(
						client,
						schema,
						resolvedOperation,
						previous,
						constraint,
						relation,
					),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(record, resolvedOperation),
				[materialization],
			)
		},
	})
}

/** Executes one retained set of ids and restores the stable preparation order. */
const executeRetainedSetBasedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'delete-many' | 'update-many' }
	>,
	targets: readonly DatabaseLogicalRecord[],
	constraint: SQL | undefined,
): Promise<DatabaseOperationOutcome<typeof operation>> => {
	if (targets.length === 0) {
		return createPostgresMutationOutcome([], [])
	}

	const id = resolveCompiledPostgresField(schema, 'id').column
	const targetIds = targets.map((target) =>
		readPreparedRecordId(schema, target),
	)
	const where = and(inArray(id, targetIds), constraint)

	if (where === undefined) {
		throw new TypeError(
			'PostgreSQL prepared set-based target could not be combined',
		)
	}

	const rows =
		operation.kind === 'update-many'
			? await client
					.update(schema.table)
					.set(compilePostgresUpdate(schema, operation.update))
					.where(where)
					.returning(compilePostgresSelection(schema))
			: await client
					.delete(schema.table)
					.where(where)
					.returning(compilePostgresSelection(schema))
	const records = rows.map((row) => readPostgresRecord(schema, row))

	if (records.length !== targets.length) {
		throw new TypeError(
			'PostgreSQL prepared set-based targets changed before execution',
		)
	}

	const recordsById = new Map<unknown, DatabaseLogicalRecord>()

	for (const record of records) {
		const recordId = readPreparedRecordId(schema, record)

		if (recordsById.has(recordId)) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation returned duplicate identities',
			)
		}

		recordsById.set(recordId, record)
	}

	const orderedRecords = targets.map((target) => {
		const record = recordsById.get(readPreparedRecordId(schema, target))

		if (record === undefined) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation returned an unknown identity',
			)
		}

		return record
	})
	const materializations = orderedRecords.map((record, index) => {
		const previous = targets[index]

		if (previous === undefined) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation lost its preimage order',
			)
		}

		return operation.kind === 'update-many'
			? immutableRecord({ current: record, kind: 'update' as const, previous })
			: immutableRecord({ kind: 'delete' as const, previous: record })
	})

	return createPostgresMutationOutcome(
		projectPostgresRecords(orderedRecords, operation),
		materializations,
	)
}

const prepareSetBasedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'delete-many' | 'update-many' }
	>,
	constraint: SQL | undefined,
	assertActive: () => void,
	prepareItems: boolean,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<
	PreparedDatabaseOperation<
		Extract<
			RuntimeMutationOperation,
			{ readonly kind: 'delete-many' | 'update-many' }
		>
	>
> => {
	const targets = prepareItems
		? await runPreparedMutationStep(operation.kind, () =>
				lockPostgresSetBasedMutationTargets(
					client,
					schema,
					operation,
					constraint,
					relationCompiler,
				),
			)
		: undefined

	return createPreparedMutationHandle({
		assertActive,
		operation,
		...(targets === undefined ? {} : { targets }),
		execute: async (resolvedOperation) => {
			if (targets !== undefined) {
				return runPreparedMutationStep(resolvedOperation.kind, () =>
					executeRetainedSetBasedMutation(
						client,
						schema,
						resolvedOperation,
						targets,
						constraint,
					),
				)
			}

			const result = await runPreparedMutationStep(
				resolvedOperation.kind,
				() =>
					resolvedOperation.kind === 'update-many'
						? executeUpdateMany(
								client,
								schema,
								resolvedOperation,
								constraint,
								relationCompiler,
							)
						: executeDeleteMany(
								client,
								schema,
								resolvedOperation,
								constraint,
								relationCompiler,
							),
			)

			return createPostgresMutationOutcome(result, [])
		},
	})
}

const prepareUpsertOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeMutationOperation, { readonly kind: 'upsert-one' }>,
	constraint: SQL | undefined,
	assertActive: () => void,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<
	PreparedDatabaseOperation<
		Extract<RuntimeMutationOperation, { readonly kind: 'upsert-one' }>
	>
> => {
	const previous = await runPreparedMutationStep(operation.kind, () =>
		lockPostgresUpsertTarget(
			client,
			schema,
			operation.query,
			constraint,
			relationCompiler,
		),
	)

	return createPreparedMutationHandle({
		assertActive,
		operation,
		target: previous,
		execute: async (resolvedOperation) => {
			if (previous !== null) {
				const current = await runPreparedMutationStep(
					resolvedOperation.kind,
					() =>
						executeRetainedUpdate(
							client,
							schema,
							resolvedOperation.update,
							previous,
							constraint,
						),
				)

				return createPostgresMutationOutcome(
					projectPostgresRecord(current, resolvedOperation),
					[
						immutableRecord({
							current,
							kind: 'update' as const,
							previous,
						}),
					],
				)
			}

			const persisted = await runPreparedMutationStep(
				resolvedOperation.kind,
				() =>
					executeUpsertItem(
						client,
						schema,
						resolvedOperation,
						constraint,
						relationCompiler,
					),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(persisted.record, resolvedOperation),
				[persisted.materialization],
			)
		},
	})
}

const prepareUpsertMany = (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'upsert-many' }
	>,
	constraint: SQL | undefined,
	assertActive: () => void,
	relationCompiler?: PostgresRelationPredicateCompiler,
): PreparedDatabaseOperation<
	Extract<RuntimeMutationOperation, { readonly kind: 'upsert-many' }>
> =>
	createPreparedMutationHandle({
		assertActive,
		operation,
		execute: async (resolvedOperation) => {
			const items = resolvedOperation.items as readonly RuntimeUpsertItem[]

			const records: DatabaseLogicalRecord[] = []
			const materializations: DatabaseMutationMaterialization[] = []

			for (const item of items) {
				const persisted = await runPreparedMutationStep(
					resolvedOperation.kind,
					() =>
						executeUpsertItem(
							client,
							schema,
							item,
							constraint,
							relationCompiler,
						),
				)
				records.push(persisted.record)
				materializations.push(persisted.materialization)
			}

			return createPostgresMutationOutcome(
				projectPostgresRecords(records, resolvedOperation),
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
	assertActive: () => void,
	prepareMutationItems = false,
	relation?: CompiledPostgresRelation,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<PreparedDatabaseOperation<TOperation>> => {
	const runtimeOperation = operation as unknown as RuntimeMutationOperation
	let prepared: unknown

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
				assertActive,
			)
			break
		case 'delete-one':
		case 'update-one':
			if (relation !== undefined && runtimeOperation.kind !== 'update-one') {
				throw new TypeError(
					'PostgreSQL relation scope requires an update-one operation',
				)
			}

			prepared = await prepareLockedSingular(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
				relation,
				relationCompiler,
			)
			break
		case 'delete-many':
		case 'update-many':
			prepared = await prepareSetBasedMutation(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
				prepareMutationItems,
				relationCompiler,
			)
			break
		case 'upsert-one':
			prepared = await prepareUpsertOne(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
				relationCompiler,
			)
			break
		case 'upsert-many':
			prepared = prepareUpsertMany(
				client,
				schema,
				runtimeOperation,
				constraint,
				assertActive,
				relationCompiler,
			)
			break
	}

	// The exhaustive switch preserves the incoming operation discriminant.
	return prepared as PreparedDatabaseOperation<TOperation>
}

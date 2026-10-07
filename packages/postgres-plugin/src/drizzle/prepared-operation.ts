import {
	FrameworkError,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabasePersistencePlan,
	type ExecutableOperationAst,
	type OperationKind,
	type PreparedDatabaseOperation,
	type PreparedDatabaseOperationExecution,
	type QueryAst,
	type UniqueUpsertTargetNode,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { and, eq, inArray, type SQL } from 'drizzle-orm'

import type { PostgresRelationPredicateCompiler } from '../query/filter-compiler.js'
import { required } from '../required.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
	type CompiledPostgresRelation,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'
import type { PostgresDrizzleClient } from './client.js'
import {
	executeCreateInput,
	executeCreateMany,
	executePostgresTargetedMutation,
	lockPostgresMutationTarget,
	lockPostgresSetBasedMutationTargets,
	tryCreatePostgresUpsert,
	type PostgresOperation,
} from './operation-executor.js'
import { mapPostgresOperationError } from './operation-error.js'
import { readPostgresPreparedOperation } from './persistence-plan.js'
import {
	projectPostgresRecord,
	projectPostgresRecords,
	readPostgresRecord,
} from './record.js'
import { executePostgresScopedRelationMutation } from './relation-executor.js'
import { compilePostgresUpdate } from './update-compiler.js'

/** Carries one schema-erased outcome; Runtime correlates it with the request kind. */
interface PostgresMutationOutcome {
	readonly materializations: readonly DatabaseMutationMaterialization[]
	readonly result: unknown
}

interface PersistedMutationItem {
	readonly materialization: DatabaseMutationMaterialization
	readonly record: DatabaseLogicalRecord
}

interface UpsertItem {
	readonly create: unknown
	readonly query: QueryAst
	readonly target: UniqueUpsertTargetNode
	readonly update: UpdateExpressionNode
}

type MutationKind = DatabaseMutationOperationAst['kind']

type ExecutePreparedMutation = (
	operation: ExecutableOperationAst,
	plan: DatabasePersistencePlan,
	constraint: SQL | undefined,
) => Promise<PostgresMutationOutcome>

interface PreparedMutationState {
	readonly execute: ExecutePreparedMutation
	readonly target?: DatabaseLogicalRecord | null
	readonly targets?: readonly DatabaseLogicalRecord[]
}

export interface PreparePostgresMutationOptions<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly assertActive: () => void
	readonly client: PostgresDrizzleClient
	readonly compileConstraint: (
		request: PreparedDatabaseOperationExecution<TOperation>,
	) => SQL | undefined
	readonly constraint: SQL | undefined
	readonly operation: TOperation
	readonly plan: DatabasePersistencePlan<TOperation>
	readonly prepareMutationItems: boolean
	readonly relation: CompiledPostgresRelation | undefined
	readonly relationCompiler: PostgresRelationPredicateCompiler | undefined
	readonly schema: CompiledPostgresSchema
}

const outcome = (
	result: unknown,
	materializations: readonly DatabaseMutationMaterialization[],
): PostgresMutationOutcome =>
	immutableRecord({
		materializations: immutableArray(materializations),
		result,
	})

const persisted = (
	materialization: DatabaseMutationMaterialization,
	record: DatabaseLogicalRecord,
): PersistedMutationItem =>
	immutableRecord({ materialization: immutableRecord(materialization), record })

/** Reuses PostgreSQL error sanitization for every database step. */
const runStep = async <TResult>(
	kind: OperationKind,
	run: () => Promise<TResult>,
): Promise<TResult> => {
	try {
		return await run()
	} catch (error: unknown) {
		throw mapPostgresOperationError(error, kind)
	}
}

const hasKind = <TKind extends MutationKind>(
	operation: ExecutableOperationAst,
	kinds: readonly TKind[],
): operation is PostgresOperation<TKind> =>
	kinds.some((kind) => kind === operation.kind)

/** Keeps each execution branch on the operation family it prepared. */
const requireKind = <TKind extends MutationKind>(
	operation: ExecutableOperationAst,
	...kinds: TKind[]
): PostgresOperation<TKind> => {
	if (!hasKind(operation, kinds)) {
		throw new TypeError(
			'PostgreSQL prepared mutation changed its operation kind',
		)
	}

	return operation
}

/** Reads one retained logical identity only after verifying schema support. */
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
		.where(retainedTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))

	return readPostgresRecord(
		schema,
		required(
			row,
			'PostgreSQL prepared update target disappeared before execution',
		),
	)
}

/** Reuses one retained identifier while preserving every accumulated constraint. */
const retainedTarget = (
	schema: CompiledPostgresSchema,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
): SQL =>
	required(
		and(
			eq(
				resolveCompiledPostgresField(schema, 'id').column,
				readPreparedRecordId(schema, previous),
			),
			constraint,
		),
		'PostgreSQL prepared mutation predicate could not be combined',
	)

const executeLockedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: PostgresOperation<'delete-one' | 'update-one'>,
	plan: DatabasePersistencePlan,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
	relation: CompiledPostgresRelation | undefined,
): Promise<PersistedMutationItem> => {
	if (operation.kind === 'update-one') {
		if (plan.kind !== 'update-one') {
			throw new TypeError('PostgreSQL update-one requires an update-one plan')
		}

		const relationResult =
			relation === undefined
				? undefined
				: await executePostgresScopedRelationMutation(
						client,
						relation,
						operation.update,
						previous,
					)

		if (relationResult !== undefined) return relationResult

		const current = await executeRetainedUpdate(
			client,
			schema,
			operation.update,
			previous,
			constraint,
		)

		return persisted({ current, kind: 'update', previous }, current)
	}

	if (plan.kind === 'update-one') {
		await executeRetainedUpdate(
			client,
			schema,
			plan.data.update,
			previous,
			constraint,
		)

		// Logical delete observers and results retain the preimage across a physical rewrite.
		return persisted({ kind: 'delete', previous }, previous)
	}
	if (plan.kind !== 'delete-one') {
		throw new TypeError('PostgreSQL delete-one received an invalid plan kind')
	}

	const [row] = await client
		.delete(schema.table)
		.where(retainedTarget(schema, previous, constraint))
		.returning(compilePostgresSelection(schema))
	const removed = readPostgresRecord(
		schema,
		required(
			row,
			'PostgreSQL prepared delete target disappeared before execution',
		),
	)

	return persisted({ kind: 'delete', previous: removed }, removed)
}

/** Executes one retained set and restores logical order after a physical rewrite. */
const executeRetainedSetBasedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: PostgresOperation<'delete-many' | 'update-many'>,
	plan: DatabasePersistencePlan,
	targets: readonly DatabaseLogicalRecord[],
	constraint: SQL | undefined,
): Promise<PostgresMutationOutcome> => {
	if (targets.length === 0) return outcome([], [])

	const where = required(
		and(
			inArray(
				resolveCompiledPostgresField(schema, 'id').column,
				targets.map((target) => readPreparedRecordId(schema, target)),
			),
			constraint,
		),
		'PostgreSQL prepared set-based target could not be combined',
	)

	if (
		plan.kind !== 'update-many' &&
		(plan.kind !== 'delete-many' || operation.kind === 'update-many')
	) {
		throw new TypeError(
			'PostgreSQL set-based mutation received an invalid plan',
		)
	}

	const rows =
		plan.kind === 'update-many'
			? await client
					.update(schema.table)
					.set(compilePostgresUpdate(schema, plan.data.update))
					.where(where)
					.returning(compilePostgresSelection(schema))
			: await client
					.delete(schema.table)
					.where(where)
					.returning(compilePostgresSelection(schema))

	const changed = rows.map((row) => readPostgresRecord(schema, row))

	if (changed.length !== targets.length) {
		throw new TypeError(
			'PostgreSQL prepared set-based targets changed before execution',
		)
	}

	const recordsById = new Map<unknown, DatabaseLogicalRecord>()

	for (const record of changed) {
		const recordId = readPreparedRecordId(schema, record)

		if (recordsById.has(recordId)) {
			throw new TypeError(
				'PostgreSQL prepared set-based mutation returned duplicate identities',
			)
		}

		recordsById.set(recordId, record)
	}

	const records = targets.map((target) =>
		required(
			recordsById.get(readPreparedRecordId(schema, target)),
			'PostgreSQL prepared set-based mutation returned an unknown identity',
		),
	)
	const materializations = records.map((current, index) => {
		const previous = required(
			targets[index],
			'PostgreSQL prepared set-based mutation lost its preimage order',
		)

		return operation.kind === 'update-many'
			? immutableRecord({ current, kind: 'update' as const, previous })
			: immutableRecord({ kind: 'delete' as const, previous })
	})

	return outcome(
		projectPostgresRecords(
			operation.kind === 'delete-many' ? targets : records,
			plan.returning.selection,
		),
		materializations,
	)
}

/** Resolves one upsert branch without guessing from a speculative pre-read. */
const executeUpsertItem = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	item: UpsertItem,
	constraint: SQL | undefined,
	relationCompiler: PostgresRelationPredicateCompiler | undefined,
): Promise<PersistedMutationItem> => {
	const lock = (): Promise<DatabaseLogicalRecord | null> =>
		lockPostgresMutationTarget(
			client,
			schema,
			item.query,
			constraint,
			relationCompiler,
		)
	let previous = await lock()

	if (previous === null) {
		const created = await tryCreatePostgresUpsert(
			client,
			schema,
			item.create,
			item.target,
		)

		if (created !== null) {
			return persisted({ current: created, kind: 'create' }, created)
		}

		// A concurrent insert may win after the initial absent-target snapshot.
		previous = await lock()
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

	return persisted({ current, kind: 'update', previous }, current)
}

/** Locks the prepared target, if any, and binds the matching execution branch. */
const preparePostgresMutationState = async (
	options: Pick<
		PreparePostgresMutationOptions<DatabaseMutationOperationAst>,
		| 'client'
		| 'constraint'
		| 'prepareMutationItems'
		| 'relation'
		| 'relationCompiler'
		| 'schema'
	>,
	prepared: ExecutableOperationAst,
): Promise<PreparedMutationState> => {
	const { client, constraint, relation, relationCompiler, schema } = options
	const lock = (query: QueryAst): Promise<DatabaseLogicalRecord | null> =>
		runStep(prepared.kind, () =>
			lockPostgresMutationTarget(
				client,
				schema,
				query,
				constraint,
				relationCompiler,
			),
		)
	const upsert = (
		kind: OperationKind,
		item: UpsertItem,
		finalConstraint: SQL | undefined,
	): Promise<PersistedMutationItem> =>
		runStep(kind, () =>
			executeUpsertItem(
				client,
				schema,
				item,
				finalConstraint,
				relationCompiler,
			),
		)

	switch (prepared.kind) {
		case 'create-one':
		case 'create-many':
			return {
				execute: async (resolved, plan) => {
					const operation = requireKind(resolved, 'create-one', 'create-many')

					if (operation.kind === 'create-one') {
						const current = await runStep(operation.kind, () =>
							executeCreateInput(client, schema, operation.input),
						)

						return outcome(
							projectPostgresRecord(current, plan.returning.selection),
							[immutableRecord({ current, kind: 'create' as const })],
						)
					}

					const records = await runStep(operation.kind, () =>
						executeCreateMany(client, schema, operation),
					)

					return outcome(
						projectPostgresRecords(records, plan.returning.selection),
						records.map((current) =>
							immutableRecord({ current, kind: 'create' as const }),
						),
					)
				},
			}
		case 'delete-one':
		case 'update-one': {
			if (relation !== undefined && prepared.kind !== 'update-one') {
				throw new TypeError(
					'PostgreSQL relation scope requires an update-one operation',
				)
			}

			const previous = await lock(prepared.query)

			return {
				target: previous,
				execute: async (resolved, plan, finalConstraint) => {
					const operation = requireKind(resolved, 'delete-one', 'update-one')

					if (previous === null) return outcome(null, [])

					const { materialization, record } = await runStep(
						operation.kind,
						() =>
							executeLockedMutation(
								client,
								schema,
								operation,
								plan,
								previous,
								finalConstraint,
								relation,
							),
					)

					return outcome(
						projectPostgresRecord(record, plan.returning.selection),
						[materialization],
					)
				},
			}
		}
		case 'delete-many':
		case 'update-many': {
			const targets = options.prepareMutationItems
				? await runStep(prepared.kind, () =>
						lockPostgresSetBasedMutationTargets(
							client,
							schema,
							prepared,
							constraint,
							relationCompiler,
						),
					)
				: undefined

			return {
				...(targets === undefined ? {} : { targets }),
				execute: async (resolved, plan, finalConstraint) => {
					const operation = requireKind(resolved, 'delete-many', 'update-many')

					if (targets !== undefined) {
						return runStep(operation.kind, () =>
							executeRetainedSetBasedMutation(
								client,
								schema,
								operation,
								plan,
								targets,
								finalConstraint,
							),
						)
					}

					const result = await runStep(operation.kind, () => {
						if (plan.kind !== operation.kind) {
							throw new TypeError(
								'PostgreSQL rewritten set-based mutations require retained targets',
							)
						}

						return executePostgresTargetedMutation(
							client,
							schema,
							operation,
							finalConstraint,
							relationCompiler,
						)
					})

					return outcome(result, [])
				},
			}
		}
		case 'upsert-one': {
			const previous = await lock(prepared.query)

			return {
				target: previous,
				execute: async (resolved, plan, finalConstraint) => {
					const operation = requireKind(resolved, 'upsert-one')

					if (previous === null) {
						const item = await upsert(
							operation.kind,
							operation,
							finalConstraint,
						)

						return outcome(
							projectPostgresRecord(item.record, plan.returning.selection),
							[item.materialization],
						)
					}

					const current = await runStep(operation.kind, () =>
						executeRetainedUpdate(
							client,
							schema,
							operation.update,
							previous,
							finalConstraint,
						),
					)

					return outcome(
						projectPostgresRecord(current, plan.returning.selection),
						[immutableRecord({ current, kind: 'update' as const, previous })],
					)
				},
			}
		}
		case 'upsert-many':
			return {
				execute: async (resolved, plan, finalConstraint) => {
					const operation = requireKind(resolved, 'upsert-many')
					const items: PersistedMutationItem[] = []

					for (const item of operation.items) {
						items.push(await upsert(operation.kind, item, finalConstraint))
					}

					return outcome(
						projectPostgresRecords(
							items.map(({ record }) => record),
							plan.returning.selection,
						),
						items.map(({ materialization }) => materialization),
					)
				},
			}
		default:
			throw new TypeError('PostgreSQL prepared operation must be a mutation')
	}
}

/**
 * Prepares one mutation inside its existing PostgreSQL transaction.
 *
 * Every branch retains ordered private materializations without exposing them
 * through the developer's selected public result. The returned handle consumes
 * its target on the first execution attempt, including failed attempts.
 */
export const preparePostgresMutation = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	options: PreparePostgresMutationOptions<TOperation>,
): Promise<PreparedDatabaseOperation<TOperation>> => {
	const state = await preparePostgresMutationState(
		options,
		readPostgresPreparedOperation(options.operation, options.plan),
	)
	let attempted = false
	const handle = Object.freeze({
		...(state.target === undefined ? {} : { target: state.target }),
		...(state.targets === undefined
			? {}
			: { targets: immutableArray(state.targets) }),
		execute: async (
			request?: PreparedDatabaseOperationExecution<TOperation>,
		): Promise<PostgresMutationOutcome> => {
			if (attempted) {
				throw new TypeError(
					'PostgreSQL prepared mutation has already been executed',
				)
			}

			// Failed and expired attempts consume the retained target as well.
			attempted = true
			options.assertActive()
			const plan = request?.plan ?? options.plan

			if (
				plan.target.schema.definition !== options.plan.target.schema.definition
			) {
				throw new TypeError(
					'PostgreSQL prepared plan changed its target schema',
				)
			}

			const operation = readPostgresPreparedOperation(
				request?.operation ?? options.operation,
				plan,
			)

			return state.execute(
				operation,
				plan,
				request === undefined
					? options.constraint
					: options.compileConstraint(request),
			)
		},
	})

	// Runtime narrowing restores the exact conditional target contract.
	return handle as unknown as PreparedDatabaseOperation<TOperation>
}

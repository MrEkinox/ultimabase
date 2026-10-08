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
import { and, inArray, type SQL } from 'drizzle-orm'

import { required } from '../required.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
	type CompiledPostgresRelation,
} from '../schema/contracts.js'
import {
	createRetainedMutationTarget,
	executeCreateInput,
	executeCreateMany,
	executePostgresTargetedMutation,
	executeRetainedUpdate,
	lockPostgresMutationTarget,
	lockPostgresSetBasedMutationTargets,
	readPreparedRecordId,
	tryCreatePostgresUpsert,
	type PostgresOperation,
	type PostgresStatementContext,
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
> extends PostgresStatementContext {
	readonly assertActive: () => void
	readonly compileConstraint: (
		request: PreparedDatabaseOperationExecution<TOperation>,
	) => SQL | undefined
	readonly constraint: SQL | undefined
	readonly operation: TOperation
	readonly plan: DatabasePersistencePlan<TOperation>
	readonly prepareMutationItems: boolean
	readonly relation: CompiledPostgresRelation | undefined
}

const outcome = (
	result: unknown,
	materializations: readonly DatabaseMutationMaterialization[],
): PostgresMutationOutcome =>
	immutableRecord({
		materializations: immutableArray(materializations),
		result,
	})

/** Projects one persisted item through the final returning contract. */
const itemOutcome = (
	{ materialization, record }: PersistedMutationItem,
	plan: DatabasePersistencePlan,
): PostgresMutationOutcome =>
	outcome(projectPostgresRecord(record, plan.returning.selection), [
		materialization,
	])

/** Projects an atomic collection while retaining every full materialization. */
const itemsOutcome = (
	items: readonly PersistedMutationItem[],
	plan: DatabasePersistencePlan,
): PostgresMutationOutcome =>
	outcome(
		projectPostgresRecords(
			items.map(({ record }) => record),
			plan.returning.selection,
		),
		items.map(({ materialization }) => materialization),
	)

const persisted = (
	materialization: DatabaseMutationMaterialization,
	record: DatabaseLogicalRecord,
): PersistedMutationItem =>
	immutableRecord({ materialization: immutableRecord(materialization), record })

const created = (current: DatabaseLogicalRecord): PersistedMutationItem =>
	persisted({ current, kind: 'create' }, current)

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

const hasKind = <TKind extends ExecutableOperationAst['kind']>(
	operation: ExecutableOperationAst,
	kinds: readonly TKind[],
): operation is PostgresOperation<TKind> =>
	kinds.some((kind) => kind === operation.kind)

/** Keeps each execution branch on the operation family it prepared. */
const requireKind = <TKind extends ExecutableOperationAst['kind']>(
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

const executeLockedMutation = async (
	context: PostgresStatementContext,
	operation: PostgresOperation<'delete-one' | 'update-one'>,
	plan: DatabasePersistencePlan,
	previous: DatabaseLogicalRecord,
	constraint: SQL | undefined,
	relation: CompiledPostgresRelation | undefined,
): Promise<PersistedMutationItem> => {
	const { client, schema } = context

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
			context,
			operation.update,
			previous,
			constraint,
		)

		return persisted({ current, kind: 'update', previous }, current)
	}

	if (plan.kind === 'update-one') {
		await executeRetainedUpdate(context, plan.data.update, previous, constraint)

		// Logical delete observers and results retain the preimage across a physical rewrite.
		return persisted({ kind: 'delete', previous }, previous)
	}
	if (plan.kind !== 'delete-one') {
		throw new TypeError('PostgreSQL delete-one received an invalid plan kind')
	}

	const [row] = await client
		.delete(schema.table)
		.where(createRetainedMutationTarget(schema, previous, constraint))
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
	{ client, schema }: PostgresStatementContext,
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

	const items = targets.map((previous) => {
		const current = required(
			recordsById.get(readPreparedRecordId(schema, previous)),
			'PostgreSQL prepared set-based mutation returned an unknown identity',
		)

		return operation.kind === 'update-many'
			? persisted({ current, kind: 'update', previous }, current)
			: persisted({ kind: 'delete', previous }, previous)
	})

	return itemsOutcome(items, plan)
}

/** Resolves one upsert branch without guessing from a speculative pre-read. */
const executeUpsertItem = async (
	context: PostgresStatementContext,
	item: UpsertItem,
	constraint: SQL | undefined,
): Promise<PersistedMutationItem> => {
	let previous = await lockPostgresMutationTarget(
		context,
		item.query,
		constraint,
	)

	if (previous === null) {
		const current = await tryCreatePostgresUpsert(
			context,
			item.create,
			item.target,
		)

		if (current !== null) return created(current)

		// A concurrent insert may win after the initial absent-target snapshot.
		previous = await lockPostgresMutationTarget(context, item.query, constraint)
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
		context,
		item.update,
		previous,
		constraint,
	)

	return persisted({ current, kind: 'update', previous }, current)
}

/** Locks the prepared target, if any, and binds the matching execution branch. */
const prepareMutationState = async (
	options: Omit<
		PreparePostgresMutationOptions<DatabaseMutationOperationAst>,
		'assertActive' | 'compileConstraint' | 'operation' | 'plan'
	>,
	prepared: ExecutableOperationAst,
): Promise<PreparedMutationState> => {
	const { constraint, relation } = options
	const lock = (query: QueryAst): Promise<DatabaseLogicalRecord | null> =>
		runStep(prepared.kind, () =>
			lockPostgresMutationTarget(options, query, constraint),
		)

	switch (prepared.kind) {
		case 'create-one':
		case 'create-many':
			return {
				execute: async (resolved, plan) => {
					const operation = requireKind(resolved, 'create-one', 'create-many')

					return operation.kind === 'create-one'
						? itemOutcome(
								created(
									await runStep(operation.kind, () =>
										executeCreateInput(options, operation.input),
									),
								),
								plan,
							)
						: itemsOutcome(
								(
									await runStep(operation.kind, () =>
										executeCreateMany(options, operation),
									)
								).map(created),
								plan,
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

					const item = await runStep(operation.kind, () =>
						executeLockedMutation(
							options,
							operation,
							plan,
							previous,
							finalConstraint,
							relation,
						),
					)

					return itemOutcome(item, plan)
				},
			}
		}
		case 'delete-many':
		case 'update-many': {
			const targets = options.prepareMutationItems
				? await runStep(prepared.kind, () =>
						lockPostgresSetBasedMutationTargets(options, prepared, constraint),
					)
				: undefined

			return {
				...(targets === undefined ? {} : { targets }),
				execute: async (resolved, plan, finalConstraint) => {
					const operation = requireKind(resolved, 'delete-many', 'update-many')

					if (targets !== undefined) {
						return runStep(operation.kind, () =>
							executeRetainedSetBasedMutation(
								options,
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
							options,
							operation,
							finalConstraint,
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
					const item = await runStep(operation.kind, async () => {
						if (previous === null) {
							return executeUpsertItem(options, operation, finalConstraint)
						}

						const current = await executeRetainedUpdate(
							options,
							operation.update,
							previous,
							finalConstraint,
						)

						return persisted({ current, kind: 'update', previous }, current)
					})

					return itemOutcome(item, plan)
				},
			}
		}
		case 'upsert-many':
			return {
				execute: async (resolved, plan, finalConstraint) => {
					const operation = requireKind(resolved, 'upsert-many')
					const items: PersistedMutationItem[] = []

					for (const item of operation.items) {
						items.push(
							await runStep(operation.kind, () =>
								executeUpsertItem(options, item, finalConstraint),
							),
						)
					}

					return itemsOutcome(items, plan)
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
	const state = await prepareMutationState(
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

			return state.execute(
				readPostgresPreparedOperation(
					request?.operation ?? options.operation,
					plan,
				),
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

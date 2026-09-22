import {
	FrameworkError,
	type QueryAst,
	type UniqueUpsertTargetNode,
	type UpdateExpressionNode,
	type DatabaseLogicalRecord,
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabasePersistencePlan,
	type ExecutableOperationAst,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import type { SQL } from 'drizzle-orm'

import type {
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from '../schema/contracts.js'
import { compilePostgresSelection } from '../schema/field.js'
import {
	executeCreateInput,
	executeCreateMany,
	executeDeleteMany,
	executeUpdateMany,
	lockPostgresSetBasedMutationTargets,
	lockPostgresMutationTarget,
	tryCreatePostgresUpsert,
} from './operation-executor.js'
import type { PostgresDrizzleClient } from './client.js'
import { mapPostgresOperationError } from './operation-error.js'
import { readPostgresRecord } from './record.js'
import { executePostgresScopedRelationMutation } from './scoped-relation-mutation.js'
import type { PostgresRelationPredicateCompiler } from '../query/filter-compiler.js'
import {
	projectPostgresRecord,
	projectPostgresRecords,
} from './result-projection.js'
import { readPostgresPreparedOperation as readPlan } from './persistence-plan.js'
import {
	createPreparedMutationHandle,
	type PreparedMutationConstraintCompiler,
} from './prepared-mutation-handle.js'
import {
	createPostgresMutationOutcome,
	createRetainedMutationTarget,
	executeRetainedSetBasedMutation,
	executeRetainedUpdate,
} from './prepared-persistence.js'

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

const executeLockedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	plan: DatabasePersistencePlan,
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
		if (plan.kind !== 'update-one') {
			throw new TypeError('PostgreSQL update-one requires an update-one plan')
		}

		if (relation !== undefined) {
			const relationResult = await executePostgresScopedRelationMutation(
				client,
				relation,
				operation.update,
				previous,
			)
			if (relationResult !== undefined) return relationResult
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
	if (plan.kind === 'update-one') {
		await executeRetainedUpdate(
			client,
			schema,
			plan.data.update,
			previous,
			constraint,
		)

		// Logical delete observers and results retain the preimage across a physical rewrite.
		return immutableRecord({
			materialization: immutableRecord({
				kind: 'delete' as const,
				previous,
			}),
			record: previous,
		})
	}
	if (plan.kind !== 'delete-one') {
		throw new TypeError('PostgreSQL delete-one received an invalid plan kind')
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
	let previous = await lockPostgresMutationTarget(
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
		previous = await lockPostgresMutationTarget(
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
	plan: DatabasePersistencePlan,
	initialConstraint: SQL | undefined,
	assertActive: () => void,
	compileConstraint: PreparedMutationConstraintCompiler<
		Extract<RuntimeMutationOperation, { readonly kind: 'create-one' }>
	>,
): PreparedDatabaseOperation<
	Extract<RuntimeMutationOperation, { readonly kind: 'create-one' }>
> =>
	createPreparedMutationHandle({
		assertActive,
		compileConstraint,
		initialConstraint,
		operation,
		plan,
		execute: async (resolvedOperation, resolvedPlan) => {
			const current = await runPreparedMutationStep(
				resolvedOperation.kind,
				() => executeCreateInput(client, schema, resolvedOperation.input),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(current, resolvedPlan.returning.selection),
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
	plan: DatabasePersistencePlan,
	initialConstraint: SQL | undefined,
	assertActive: () => void,
	compileConstraint: PreparedMutationConstraintCompiler<
		Extract<RuntimeMutationOperation, { readonly kind: 'create-many' }>
	>,
): PreparedDatabaseOperation<
	Extract<RuntimeMutationOperation, { readonly kind: 'create-many' }>
> =>
	createPreparedMutationHandle({
		assertActive,
		compileConstraint,
		initialConstraint,
		operation,
		plan,
		execute: async (resolvedOperation, resolvedPlan) => {
			const records = await runPreparedMutationStep(
				resolvedOperation.kind,
				() => executeCreateMany(client, schema, resolvedOperation),
			)
			const materializations = records.map((current) =>
				immutableRecord({ current, kind: 'create' as const }),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecords(records, resolvedPlan.returning.selection),
				materializations,
			)
		},
	})

const prepareLockedSingular = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	plan: DatabasePersistencePlan,
	constraint: SQL | undefined,
	assertActive: () => void,
	compileConstraint: PreparedMutationConstraintCompiler<RuntimeLockedOperation>,
	relation: CompiledPostgresRelation | undefined,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<PreparedDatabaseOperation<RuntimeLockedOperation>> => {
	const previous = await runPreparedMutationStep(operation.kind, () =>
		lockPostgresMutationTarget(
			client,
			schema,
			operation.query,
			constraint,
			relationCompiler,
		),
	)

	return createPreparedMutationHandle({
		assertActive,
		compileConstraint,
		initialConstraint: constraint,
		operation,
		plan,
		target: previous,
		execute: async (resolvedOperation, resolvedPlan, finalConstraint) => {
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
						resolvedPlan,
						previous,
						finalConstraint,
						relation,
					),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(record, resolvedPlan.returning.selection),
				[materialization],
			)
		},
	})
}

const prepareSetBasedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<
		RuntimeMutationOperation,
		{ readonly kind: 'delete-many' | 'update-many' }
	>,
	plan: DatabasePersistencePlan,
	constraint: SQL | undefined,
	assertActive: () => void,
	compileConstraint: PreparedMutationConstraintCompiler<
		Extract<
			RuntimeMutationOperation,
			{ readonly kind: 'delete-many' | 'update-many' }
		>
	>,
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
		compileConstraint,
		initialConstraint: constraint,
		operation,
		plan,
		...(targets === undefined ? {} : { targets }),
		execute: async (resolvedOperation, resolvedPlan, finalConstraint) => {
			if (targets !== undefined) {
				return runPreparedMutationStep(resolvedOperation.kind, () =>
					executeRetainedSetBasedMutation(
						client,
						schema,
						resolvedOperation,
						resolvedPlan,
						targets,
						finalConstraint,
					),
				)
			}

			const result = await runPreparedMutationStep(
				resolvedOperation.kind,
				() => {
					if (resolvedPlan.kind !== resolvedOperation.kind) {
						throw new TypeError(
							'PostgreSQL rewritten set-based mutations require retained targets',
						)
					}

					return resolvedOperation.kind === 'update-many'
						? executeUpdateMany(
								client,
								schema,
								resolvedOperation,
								finalConstraint,
								relationCompiler,
							)
						: executeDeleteMany(
								client,
								schema,
								resolvedOperation,
								finalConstraint,
								relationCompiler,
							)
				},
			)

			return createPostgresMutationOutcome(result, [])
		},
	})
}

const prepareUpsertOne = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: Extract<RuntimeMutationOperation, { readonly kind: 'upsert-one' }>,
	plan: DatabasePersistencePlan,
	constraint: SQL | undefined,
	assertActive: () => void,
	compileConstraint: PreparedMutationConstraintCompiler<
		Extract<RuntimeMutationOperation, { readonly kind: 'upsert-one' }>
	>,
	relationCompiler?: PostgresRelationPredicateCompiler,
): Promise<
	PreparedDatabaseOperation<
		Extract<RuntimeMutationOperation, { readonly kind: 'upsert-one' }>
	>
> => {
	const previous = await runPreparedMutationStep(operation.kind, () =>
		lockPostgresMutationTarget(
			client,
			schema,
			operation.query,
			constraint,
			relationCompiler,
		),
	)

	return createPreparedMutationHandle({
		assertActive,
		compileConstraint,
		initialConstraint: constraint,
		operation,
		plan,
		target: previous,
		execute: async (resolvedOperation, resultPlan, finalConstraint) => {
			if (previous !== null) {
				const current = await runPreparedMutationStep(
					resolvedOperation.kind,
					() =>
						executeRetainedUpdate(
							client,
							schema,
							resolvedOperation.update,
							previous,
							finalConstraint,
						),
				)

				return createPostgresMutationOutcome(
					projectPostgresRecord(current, resultPlan.returning.selection),
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
						finalConstraint,
						relationCompiler,
					),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(persisted.record, resultPlan.returning.selection),
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
	plan: DatabasePersistencePlan,
	initialConstraint: SQL | undefined,
	assertActive: () => void,
	compileConstraint: PreparedMutationConstraintCompiler<
		Extract<RuntimeMutationOperation, { readonly kind: 'upsert-many' }>
	>,
	relationCompiler?: PostgresRelationPredicateCompiler,
): PreparedDatabaseOperation<
	Extract<RuntimeMutationOperation, { readonly kind: 'upsert-many' }>
> =>
	createPreparedMutationHandle({
		assertActive,
		compileConstraint,
		initialConstraint,
		operation,
		plan,
		execute: async (resolvedOperation, resolvedPlan, finalConstraint) => {
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
							finalConstraint,
							relationCompiler,
						),
				)
				records.push(persisted.record)
				materializations.push(persisted.materialization)
			}

			return createPostgresMutationOutcome(
				projectPostgresRecords(records, resolvedPlan.returning.selection),
				materializations,
			)
		},
	})

interface PreparePostgresMutationOptions<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly assertActive: () => void
	readonly client: PostgresDrizzleClient
	readonly compileConstraint: PreparedMutationConstraintCompiler<TOperation>
	readonly constraint: SQL | undefined
	readonly operation: TOperation
	readonly plan: DatabasePersistencePlan<TOperation>
	readonly prepareMutationItems: boolean
	readonly relation: CompiledPostgresRelation | undefined
	readonly relationCompiler: PostgresRelationPredicateCompiler | undefined
	readonly schema: CompiledPostgresSchema
}

/**
 * Prepares one mutation inside its existing PostgreSQL transaction.
 *
 * Every branch retains ordered private materializations without exposing them
 * through the developer's selected public result.
 */
export const preparePostgresMutation = async <
	const TOperation extends DatabaseMutationOperationAst,
>({
	assertActive,
	client,
	compileConstraint,
	constraint,
	operation,
	plan,
	prepareMutationItems,
	relation,
	relationCompiler,
	schema,
}: PreparePostgresMutationOptions<TOperation>): Promise<
	PreparedDatabaseOperation<TOperation>
> => {
	const runtimeOperation = readPlan(operation, plan) as RuntimeMutationOperation
	const runtimePlan = plan as unknown as DatabasePersistencePlan
	const runtimeCompileConstraint =
		compileConstraint as unknown as PreparedMutationConstraintCompiler<RuntimeMutationOperation>
	let prepared: unknown

	switch (runtimeOperation.kind) {
		case 'create-one':
			prepared = prepareCreateOne(
				client,
				schema,
				runtimeOperation,
				runtimePlan,
				constraint,
				assertActive,
				runtimeCompileConstraint,
			)
			break
		case 'create-many':
			prepared = prepareCreateMany(
				client,
				schema,
				runtimeOperation,
				runtimePlan,
				constraint,
				assertActive,
				runtimeCompileConstraint,
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
				runtimePlan,
				constraint,
				assertActive,
				runtimeCompileConstraint,
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
				runtimePlan,
				constraint,
				assertActive,
				runtimeCompileConstraint,
				prepareMutationItems,
				relationCompiler,
			)
			break
		case 'upsert-one':
			prepared = await prepareUpsertOne(
				client,
				schema,
				runtimeOperation,
				runtimePlan,
				constraint,
				assertActive,
				runtimeCompileConstraint,
				relationCompiler,
			)
			break
		case 'upsert-many':
			prepared = prepareUpsertMany(
				client,
				schema,
				runtimeOperation,
				runtimePlan,
				constraint,
				assertActive,
				runtimeCompileConstraint,
				relationCompiler,
			)
			break
	}

	// The exhaustive switch preserves the incoming operation discriminant.
	return prepared as PreparedDatabaseOperation<TOperation>
}

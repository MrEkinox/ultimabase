import type {
	DatabaseLogicalRecord,
	DatabaseMutationMaterialization,
	DatabaseMutationOperationAst,
	DatabaseOperationOutcome,
	ExecutableOperationAst,
	PreparedDatabaseOperation,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { eq } from 'drizzle-orm'

import type { CompiledPostgresSchema } from '../schema/contracts.js'
import {
	compilePostgresSelection,
	resolveCompiledPostgresField,
} from '../schema/field.js'
import {
	executeCreateOne,
	executePostgresOperation,
	lockPostgresSingularMutationTarget,
	readBuiltInQuery,
} from './operation-executor.js'
import type { PostgresDrizzleClient } from './client.js'
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
	operation: RuntimeLockedOperation,
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

const executeLockedMutation = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	previous: DatabaseLogicalRecord,
): Promise<
	Readonly<{
		materialization: DatabaseMutationMaterialization
		record: DatabaseLogicalRecord
	}>
> => {
	const id = resolveCompiledPostgresField(schema, 'id').column
	const target = eq(id, readPreparedRecordId(schema, previous))
	const selection = compilePostgresSelection(schema)

	if (operation.kind === 'update-one') {
		const [row] = await client
			.update(schema.table)
			.set(compilePostgresUpdate(schema, operation.update))
			.where(target)
			.returning(selection)

		if (row === undefined) {
			throw new TypeError(
				'PostgreSQL prepared update target disappeared before execution',
			)
		}

		const current = decodePostgresRecord(schema, row)

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
		.where(target)
		.returning(selection)

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

const prepareLockedSingular = async (
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: RuntimeLockedOperation,
	assertActive: () => void,
): Promise<PreparedDatabaseOperation<DatabaseMutationOperationAst>> => {
	const previous = await runPreparedMutationStep(operation.kind, () =>
		lockPostgresSingularMutationTarget(client, schema, operation),
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
				() => executeLockedMutation(client, schema, operation, previous),
			)

			return createPostgresMutationOutcome(
				projectPostgresRecord(record, operation),
				[materialization],
			)
		},
	})
}

/**
 * Prepares one mutation inside its existing PostgreSQL transaction.
 *
 * Issue 508 replaces the unreachable bulk/upsert fallback when those terminals
 * gain their physical implementation and ordered materializations.
 */
export const preparePostgresMutation = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	client: PostgresDrizzleClient,
	schema: CompiledPostgresSchema,
	operation: TOperation,
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
		case 'delete-one':
		case 'update-one':
			prepared = await prepareLockedSingular(
				client,
				schema,
				runtimeOperation,
				assertActive,
			)
			break
		case 'create-many':
		case 'delete-many':
		case 'update-many':
		case 'upsert-many':
		case 'upsert-one':
			prepared = createPreparedMutationHandle({
				assertActive,
				execute: async () => {
					const result = await executePostgresOperation(
						client,
						schema,
						runtimeOperation,
					)

					return createPostgresMutationOutcome(result, [])
				},
			})
	}

	// The exhaustive switch preserves the incoming operation discriminant.
	return prepared as unknown as PreparedDatabaseOperation<TOperation>
}

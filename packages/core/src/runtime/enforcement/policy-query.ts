import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { CompiledCommand } from '../../plugins/command-graph.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { PublicError } from '../../errors/public-error.js'
import { createQueryAst } from '../../query/index.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import type {
	RuntimeLogicalMutationOperationAst,
	RuntimeLogicalOperationAst,
	RuntimePipelineStages,
} from '../pipeline/contracts.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import { enforceRuntimeOperation } from '../pipeline/stage-inputs.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import { combineDatabaseRowFilters } from './state.js'

/**
 * Marks an operation built by `ultimabase.can()` (ADR-0305): it carries no
 * real input or selection, so policies skip their field rules, and `item`
 * tells whether candidate data or a persisted row is being asked about.
 */
export interface PolicyQuery {
	/** True when `can()` received an `item`. */
	readonly item: boolean
}

const policyQueries = new WeakMap<object, PolicyQuery>()

/**
 * Reads the `can()` marker of one operation, `undefined` for real requests.
 * Policy plugins use it to skip field rules, which need input or a selection.
 *
 * @example `if (readPolicyQuery(operation) !== undefined) return`
 */
export const readPolicyQuery = (operation: unknown): PolicyQuery | undefined =>
	typeof operation === 'object' && operation !== null
		? policyQueries.get(operation)
		: undefined

type NativeKind =
	| 'count'
	| 'create-one'
	| 'delete-one'
	| 'exists'
	| 'find-many'
	| 'find-one'
	| 'update-one'
	| 'upsert-one'

// A write operation is asked about through its One method: a write rule
// never depends on cardinality (ADR-0347).
const nativeKinds: ReadonlyMap<string, NativeKind> = new Map([
	['count', 'count'],
	['create', 'create-one'],
	['delete', 'delete-one'],
	['exists', 'exists'],
	['findMany', 'find-many'],
	['findOne', 'find-one'],
	['update', 'update-one'],
	['upsert', 'upsert-one'],
])

/** @internal Whether `can()` asks about `key` through one native terminal. */
export const isNativePolicyQueryKey = (key: string): boolean =>
	nativeKinds.has(key)

/** What `can()` asks Core to decide for one principal and one schema. */
export interface PolicyQueryRequest {
	readonly command: CompiledCommand | undefined
	readonly context: RequestContext
	readonly item: Readonly<Record<string, unknown>> | undefined
	readonly operation: string
	readonly schema: SchemaDefinition
}

const createOperation = (
	request: PolicyQueryRequest,
): RuntimeLogicalOperationAst => {
	const { schema, item } = request
	const selection = immutableRecord({
		kind: 'selection' as const,
		fields: immutableArray([
			immutableRecord({ kind: 'selected-field' as const, field: 'id' }),
		]),
	})
	const query = immutableRecord({ ...createQueryAst(schema), selection })
	const emptyUpdate = immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray([]),
	})
	const native = nativeKinds.get(request.operation)
	const id = typeof item?.id === 'string' ? item.id : undefined
	switch (native) {
		case 'create-one':
			return immutableRecord({
				input: immutableRecord(item ?? {}),
				kind: native,
				schema: query.schema,
				selection,
			})
		case 'update-one':
			return immutableRecord({ kind: native, query, update: emptyUpdate })
		case 'upsert-one':
			return immutableRecord({
				create: immutableRecord({}),
				kind: native,
				query,
				target: immutableRecord({
					fields: immutableArray(['id']),
					kind: 'unique-upsert-target' as const,
				}),
				update: emptyUpdate,
			})
		case undefined:
			break
		default:
			return immutableRecord({ kind: native, query })
	}
	const command = request.command
	if (command?.kind !== 'mutation') {
		throw new TypeError(
			`can() received an unknown operation for ${schema.className}: ${request.operation}`,
		)
	}
	return immutableRecord({
		command: request.operation,
		effect: undefined,
		id: id ?? '',
		input: undefined,
		item: undefined,
		kind: 'plugin-schema-mutation' as const,
		mutation: command.definition,
		originalItem: undefined,
		owner: command.owner,
		query,
	})
}

/** Fails closed on refusals while letting real failures propagate. */
const isRefusal = (error: unknown): boolean =>
	error instanceof PublicError ||
	(error instanceof FrameworkError &&
		(error.code === 'PERMISSION_DENIED' || error.code === 'NOT_FOUND'))

/** Loads the persisted row an item names when it matches every row constraint. */
const loadVisibleRow = async (
	stages: Readonly<RuntimePipelineStages>,
	schema: SchemaDefinition,
	id: string,
	enforced: Awaited<ReturnType<typeof enforceRuntimeOperation>>,
): Promise<Readonly<Record<string, unknown>> | undefined> => {
	const rowFilter = combineDatabaseRowFilters(
		createQueryValueFilter(schema, 'equal', 'id', id),
		enforced.rowFilter,
	)
	const row: unknown = await stages.databaseOperation.execute(
		createDatabasePersistenceRequest({
			operation: immutableRecord({
				kind: 'find-one' as const,
				query: createQueryAst(schema),
			}),
			...(rowFilter === undefined ? {} : { rowFilter }),
			...(enforced.relationPredicates === undefined
				? {}
				: { relationPredicates: enforced.relationPredicates }),
		}),
	)
	return isPlainRecord(row) ? row : undefined
}

/**
 * Decides whether one operation would be permitted, as at execution time,
 * without running business hooks, input resolution, validation or writes.
 */
export const evaluatePolicyQuery = async (
	stages: Readonly<RuntimePipelineStages>,
	relationFilters: RuntimeRelationFilterResolver | undefined,
	request: PolicyQueryRequest,
): Promise<boolean> => {
	if (stages.enforcement === undefined) return true
	const operation = createOperation(request)
	policyQueries.set(
		operation,
		immutableRecord({ item: request.item !== undefined }),
	)
	try {
		const enforced = await enforceRuntimeOperation(
			stages,
			request.context,
			operation as DatabaseOperationAst,
			undefined,
			undefined,
			relationFilters,
		)
		const id = request.item?.id
		// Without an item a filter counts as permitted for its rows; a create
		// item is candidate data the guards above already checked.
		if (
			request.item === undefined ||
			(operation.kind !== 'plugin-schema-mutation' &&
				operation.kind === 'create-one')
		) {
			return true
		}
		if (typeof id !== 'string' || id.length === 0) {
			throw new TypeError('can() item must carry the id of a persisted row')
		}
		const row = await loadVisibleRow(stages, request.schema, id, enforced)
		if (row === undefined) return false
		const target: RuntimeLogicalMutationOperationAst | undefined =
			operation.kind === 'plugin-schema-mutation'
				? immutableRecord({
						...operation,
						item: operation.mutation.effect === 'delete' ? null : row,
						originalItem: row,
					})
				: isRuntimeMutationOperation(operation)
					? operation
					: undefined
		// A read only needs the row to match its constraints.
		if (target === undefined) return true
		policyQueries.set(target, immutableRecord({ item: true }))
		await stages.enforcement.enforcePreparedMutation?.(
			immutableRecord({
				context: request.context,
				operation: target,
				target: row,
			}),
		)
		return true
	} catch (error: unknown) {
		if (isRefusal(error)) return false
		throw error
	}
}

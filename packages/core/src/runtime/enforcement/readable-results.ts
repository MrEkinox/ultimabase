import { immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import {
	createQueryAst,
	type QueryInclusionNode,
	type QuerySelectionNode,
} from '../../query/index.js'
import {
	createQueryMembershipFilter,
	createQueryValueFilter,
} from '../../query/filters/factory.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseMutationMaterializationSource,
	DatabaseOperationExecutor,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import { isRuntimeMutationOperation } from '../operations/characteristics.js'
import {
	readOperationResultInclusion,
	readOperationResultSelection,
} from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'
import { runWithRuntimeNestedWriteStageContext } from '../nested-writes/execution-context.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimePipelineStages,
} from '../pipeline/contracts.js'
import { enforceRuntimeOperation } from '../pipeline/stage-inputs.js'
import type { RuntimeRelationFilterResolver } from '../relation-filters/execution.js'
import { combineDatabaseRowFilters } from './state.js'

/** What one readability check needs besides the rows it checks (ADR-0306). */
export interface ReadableResultCheck {
	readonly context: RequestContext
	readonly executor: DatabaseOperationExecutor
	readonly inclusion: QueryInclusionNode
	readonly relationFilters: RuntimeRelationFilterResolver | undefined
	readonly schema: SchemaDefinition
	readonly selection: QuerySelectionNode
	readonly stages: Readonly<RuntimePipelineStages>
}

/**
 * `select: { id: true }` reveals nothing the caller did not send or receive
 * anyway, so it is always allowed and skips the check (ADR-0306, decision 4).
 */
export const selectsOnlyIdentifier = (
	selection: QuerySelectionNode,
	inclusion: QueryInclusionNode,
): boolean =>
	inclusion.fields.length === 0 &&
	selection.fields.length === 1 &&
	selection.fields[0]?.field === 'id'

/** Tells whether a mutation result must pass the row read rules. */
export const requiresReadableResult = (
	check: Pick<
		ReadableResultCheck,
		'context' | 'inclusion' | 'selection' | 'stages'
	>,
): boolean =>
	// Master bypasses authorization, not validation (decision 7).
	check.context.access.mode !== 'master' &&
	check.stages.enforcement !== undefined &&
	!selectsOnlyIdentifier(check.selection, check.inclusion)

const isPermissionDenied = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'PERMISSION_DENIED'

const createUnreadableResultError = (
	schema: SchemaDefinition,
): FrameworkError<'PERMISSION_DENIED'> =>
	new FrameworkError(
		'PERMISSION_DENIED',
		`Mutation result of ${schema.className} is not readable by the caller.`,
		{
			publicMessage: `The ${schema.className} result is not readable by the caller: request select: { id: true } or review the ${schema.className} read rule.`,
			internalDetails: { kind: 'unreadable-mutation-result' },
		},
	)

const readRowConstraints = async (
	check: ReadableResultCheck,
): Promise<
	| Readonly<{
			relationPredicates: Awaited<
				ReturnType<typeof enforceRuntimeOperation>
			>['relationPredicates']
			rowFilter: DatabaseRowFilterNode | undefined
	  }>
	| 'denied'
> => {
	// Every installed policy decides a single-row read (`one`) of the schema.
	const query = createQueryAst(check.schema)
	const probe = immutableRecord({
		kind: 'find-one' as const,
		query: immutableRecord({
			...query,
			selection: immutableRecord({
				kind: 'selection' as const,
				fields: [
					immutableRecord({ kind: 'selected-field' as const, field: 'id' }),
				],
			}),
		}),
	})
	try {
		// The probe is a plain read, outside any nested write being executed.
		const enforced = await runWithRuntimeNestedWriteStageContext(
			undefined,
			() =>
				enforceRuntimeOperation(
					check.stages,
					check.context,
					probe,
					undefined,
					undefined,
					check.relationFilters,
				),
		)
		return immutableRecord({
			relationPredicates: enforced.relationPredicates,
			rowFilter: enforced.rowFilter,
		})
	} catch (error: unknown) {
		if (isPermissionDenied(error)) return 'denied'
		throw error
	}
}

/**
 * Rejects the mutation when one of its rows is not readable by the caller,
 * with one `exists` query (or one grouped `count`) in the active transaction.
 * PostgreSQL's `RETURNING` under row-level security refuses the same case.
 */
export const assertReadableMutationRows = async (
	check: ReadableResultCheck,
	ids: readonly string[],
): Promise<void> => {
	const unique = [...new Set(ids)]
	if (unique.length === 0 || !requiresReadableResult(check)) return
	const constraints = await readRowConstraints(check)
	if (constraints === 'denied') {
		throw createUnreadableResultError(check.schema)
	}
	// A read guard granting every row without a filter needs no query.
	if (
		constraints.rowFilter === undefined &&
		constraints.relationPredicates === undefined
	) {
		return
	}
	const [first] = unique
	const identity =
		unique.length === 1 && first !== undefined
			? createQueryValueFilter(check.schema, 'equal', 'id', first)
			: createQueryMembershipFilter(check.schema, 'in', 'id', unique)
	const rowFilter = combineDatabaseRowFilters(
		identity,
		constraints.rowFilter,
	)
	const query = createQueryAst(check.schema)
	const readable: unknown =
		unique.length === 1
			? await check.executor.execute(
					createDatabasePersistenceRequest({
						operation: immutableRecord({ kind: 'exists' as const, query }),
						...(rowFilter === undefined ? {} : { rowFilter }),
						...(constraints.relationPredicates === undefined
							? {}
							: { relationPredicates: constraints.relationPredicates }),
					}),
				)
			: (await check.executor.execute(
					createDatabasePersistenceRequest({
						operation: immutableRecord({ kind: 'count' as const, query }),
						...(rowFilter === undefined ? {} : { rowFilter }),
						...(constraints.relationPredicates === undefined
							? {}
							: { relationPredicates: constraints.relationPredicates }),
					}),
				)) === unique.length
	if (readable !== true) throw createUnreadableResultError(check.schema)
}

/** Reads the identifiers of the rows a create, update or upsert left behind. */
export const readResultingRowIds = (
	executor: DatabaseOperationExecutor,
	outcome: DatabaseMutationMaterializationSource,
): readonly string[] =>
	outcome.materializations.flatMap((materialization) => {
		if (materialization.kind === 'delete') return []
		const identity: unknown =
			executor.readObjectIdentity?.(materialization.current) ??
			materialization.current.id
		return typeof identity === 'string' ? [identity] : []
	})

/** Prepares the check of one mutation's result, or `undefined` when none applies. */
export const prepareReadableResultCheck = (
	input: Omit<ReadableResultCheck, 'inclusion' | 'schema' | 'selection'> &
		Readonly<{ operation: RuntimeLogicalOperationAst }>,
): ReadableResultCheck | undefined => {
	const { operation } = input
	if (
		operation.kind !== 'plugin-schema-mutation' &&
		!isRuntimeMutationOperation(operation)
	) {
		return undefined
	}
	const schema: unknown = getOperationSchema(input.operation)
	if (!Schema.is(schema)) return undefined
	const check: ReadableResultCheck = immutableRecord({
		context: input.context,
		executor: input.executor,
		inclusion: readOperationResultInclusion(input.operation),
		relationFilters: input.relationFilters,
		schema,
		selection: readOperationResultSelection(input.operation),
		stages: input.stages,
	})
	return requiresReadableResult(check) ? check : undefined
}

/** The checks one pipeline mutation runs: delete pre-images or resulting rows. */
export interface ReadableResultHooks {
	readonly result?: (
		outcome: DatabaseMutationMaterializationSource,
	) => Promise<void>
	readonly targets?: (ids: readonly string[]) => Promise<void>
}

/** Prepares the checks of one pipeline mutation (ADR-0306). */
export const prepareReadableResultHooks = (
	input: Parameters<typeof prepareReadableResultCheck>[0],
): ReadableResultHooks => {
	const check = prepareReadableResultCheck(input)
	if (check === undefined) return {}
	const { kind } = input.operation
	// A delete answers with its pre-image, checked on the locked target.
	return kind === 'delete-one' || kind === 'delete-many'
		? { targets: (ids) => assertReadableMutationRows(check, ids) }
		: {
				result: (outcome) =>
					assertReadableMutationRows(
						check,
						readResultingRowIds(check.executor, outcome),
					),
			}
}

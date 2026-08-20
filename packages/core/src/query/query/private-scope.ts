import type { SchemaDefinition } from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import { createQueryValueFilter } from '../filters/factory.js'
import type { OperationObjectId } from '../operations/contracts.js'
import type {
	OperationPrivateScope,
	QueryRelationPrivateScope,
} from '../operations/execution.js'
import type { NormalizedQueryInput } from './input.js'
import type { QueryBuilder } from './query.js'

/** @internal Carries one authoring result into trusted scope and execution helpers. */
export type QueryExecutionInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
> =
	| NormalizedQueryInput<TSchema, TSelectedField, TIncludedPointer>
	| QueryBuilder<TSchema, TSelectedField, TIncludedPointer>

const queryPrivateScopes = new WeakMap<object, OperationPrivateScope>()

/** Reads a trusted scope that must remain invisible to QueryBuilder hooks and serialization. */
export const readQueryPrivateScope = (
	query: object,
): OperationPrivateScope | undefined => queryPrivateScopes.get(query)

/** Retains one immutable framework scope beside, never inside, the public AST. */
export const storeQueryPrivateScope = (
	query: object,
	scope: OperationPrivateScope | undefined,
): void => {
	if (scope !== undefined) {
		queryPrivateScopes.set(query, scope)
	}
}

/**
 * Applies a framework-owned object identity without exposing it to QueryBuilder hooks.
 *
 * @internal Pointer and relation handles are the only intended callers.
 */
export const scopeQueryToObjectId = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	id: OperationObjectId<TSchema>,
	options: Readonly<{ readonly protectedPolicyDeniedAsMissing?: true }> = {},
): NormalizedQueryInput<TSchema, TSelectedField, TIncludedPointer> => {
	const rowFilter = createQueryValueFilter(query.schema, 'equal', 'id', id)
	const scope: OperationPrivateScope = immutableRecord({
		kind: 'row-filter',
		...(options.protectedPolicyDeniedAsMissing === undefined
			? {}
			: { protectedPolicyDeniedAsMissing: true as const }),
		objectId: id,
		rowFilter,
	})

	const scoped = immutableRecord({ ast: query.ast, schema: query.schema })

	storeQueryPrivateScope(scoped, scope)

	return scoped
}

/** Describes one trusted relation restriction before it enters private QueryBuilder state. */
export interface QueryRelationScopeInput<
	TSource extends SchemaDefinition = SchemaDefinition,
	TTarget extends SchemaDefinition = SchemaDefinition,
> {
	readonly fieldName: string
	readonly source: TSource
	readonly sourceObjectId: string
	readonly target: TTarget
}

/**
 * Applies one framework-owned relation edge without adding it to the public AST.
 *
 * @internal Persisted Relation handles are the only intended caller.
 */
export const scopeQueryToRelation = <
	const TSource extends SchemaDefinition,
	const TTarget extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TTarget>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TTarget, TSelectedField, TIncludedPointer>,
	input: QueryRelationScopeInput<TSource, TTarget>,
): NormalizedQueryInput<TTarget, TSelectedField, TIncludedPointer> => {
	if (query.schema !== input.target) {
		throw new TypeError('relation query must use its exact target schema')
	}

	const scope: QueryRelationPrivateScope = immutableRecord({
		fieldPath: immutableArray([input.fieldName]),
		kind: 'relation',
		source: input.source,
		sourceObjectId: input.sourceObjectId,
		target: input.target,
	})

	const scoped = immutableRecord({ ast: query.ast, schema: query.schema })

	storeQueryPrivateScope(scoped, scope)

	return scoped
}

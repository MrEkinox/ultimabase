import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import { createQueryValueFilter } from '../filters/factory.js'
import type { OperationObjectId } from '../operations/contracts.js'
import type { OperationPrivateScope } from '../operations/execution.js'
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

const withPrivateScope = <
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	scope: OperationPrivateScope,
): NormalizedQueryInput<TSchema, TSelectedField, TIncludedPointer> => {
	const scoped = immutableRecord({ ast: query.ast, schema: query.schema })

	storeQueryPrivateScope(scoped, scope)
	return scoped
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
	return withPrivateScope(
		query,
		immutableRecord({
			kind: 'row-filter',
			...(options.protectedPolicyDeniedAsMissing === undefined
				? {}
				: { protectedPolicyDeniedAsMissing: true as const }),
			objectId: id,
			rowFilter: createQueryValueFilter(query.schema, 'equal', 'id', id),
		}),
	)
}

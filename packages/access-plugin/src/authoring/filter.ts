import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import {
	normalizeLogicalFilter,
	resolveWhereInput,
	WhereBuilder,
	type QueryFilterNode,
	type SchemaDefinition,
	type WhereInput,
} from '@ultimabase/core'

/** Creates one immutable builder whose branch remains private until returned. */
export const createAccessWhere = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
): WhereBuilder<TSchema> => new WhereBuilder(schema)

/** Converts one callback result through the same object normalizer as public `where`. */
export const normalizeAccessWhereResult = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	result: unknown,
): QueryFilterNode<TSchema> => {
	if (!(result instanceof WhereBuilder) && !isPlainRecord(result)) {
		throw new TypeError(
			'Access where must return undefined, a WhereInput, or a WhereBuilder',
		)
	}

	return resolveWhereInput(
		schema,
		result as WhereBuilder<TSchema> | WhereInput<TSchema>,
	)
}

/** ANDs independent policy results so no later contribution can broaden rows. */
export const combineAccessWhereResults = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	results: readonly unknown[],
): QueryFilterNode<TSchema> =>
	normalizeLogicalFilter({
		kind: 'and',
		expressions: immutableArray(
			results.map((result) => normalizeAccessWhereResult(schema, result)),
		),
	})

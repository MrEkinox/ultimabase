import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import {
	WhereBuilder,
	type QueryFilterNode,
	type WhereInput,
} from '../../query/index.js'
import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import { resolveWhereInput } from '../../query/filters/where.js'
import type { SchemaDefinition } from '../schema/definition.js'

/** Names every typed predicate value accepted from one Access filter callback. */
export type AccessWhereResult<TSchema extends SchemaDefinition> =
	boolean | WhereBuilder<TSchema> | WhereInput<TSchema>

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
	if (typeof result === 'boolean') {
		return normalizeLogicalFilter({ kind: 'constant', value: result })
	}

	if (!(result instanceof WhereBuilder) && !isPlainRecord(result)) {
		throw new TypeError(
			'Access filter result must be a boolean, WhereInput, or WhereBuilder',
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

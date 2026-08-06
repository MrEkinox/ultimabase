import type { SchemaDefinition } from '../../schema/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryExpressionNode } from '../ast/contracts.js'
import type { QueryPrimitiveFilterNode } from './primitive.js'
import type { QueryRelationPredicateForSchema } from './relation.js'

/** Reserves structural discriminants so plugin leaves cannot shadow logic. */
export type QueryLogicalFilterKind = 'and' | 'constant' | 'not' | 'or'

/** Represents an algebraic truth value produced by empty or decisive groups. */
export interface QueryConstantFilterNode extends QueryExpressionNode {
	readonly kind: 'constant'
	readonly value: boolean
}

/** Requires every nested expression to match. */
export interface QueryAndFilterNode<
	TLeaf extends QueryExpressionNode = QueryExpressionNode,
> extends QueryExpressionNode {
	readonly kind: 'and'
	readonly expressions: readonly QueryFilterExpression<TLeaf>[]
}

/** Requires at least one nested expression to match. */
export interface QueryOrFilterNode<
	TLeaf extends QueryExpressionNode = QueryExpressionNode,
> extends QueryExpressionNode {
	readonly kind: 'or'
	readonly expressions: readonly QueryFilterExpression<TLeaf>[]
}

/** Negates exactly one nested expression without changing its leaf contract. */
export interface QueryNotFilterNode<
	TLeaf extends QueryExpressionNode = QueryExpressionNode,
> extends QueryExpressionNode {
	readonly kind: 'not'
	readonly expression: QueryFilterExpression<TLeaf>
}

/** Collects every recursively composable logical node. */
export type QueryLogicalFilterNode<
	TLeaf extends QueryExpressionNode = QueryExpressionNode,
> =
	| QueryConstantFilterNode
	| QueryAndFilterNode<TLeaf>
	| QueryOrFilterNode<TLeaf>
	| QueryNotFilterNode<TLeaf>

/** Recursively composes an immutable logical tree around one leaf union. */
export type QueryFilterExpression<
	TLeaf extends QueryExpressionNode = QueryExpressionNode,
> = TLeaf | QueryLogicalFilterNode<TLeaf>

/** Lists every schema-correlated leaf accepted by the portable QueryBuilder AST. */
export type QuerySchemaFilterLeaf<TSchema extends SchemaDefinition> =
	QueryPrimitiveFilterNode<TSchema> | QueryRelationPredicateForSchema<TSchema>

/** Specializes the recursive expression tree to one exact schema. */
export type QueryFilterNode<TSchema extends SchemaDefinition> =
	QueryFilterExpression<QuerySchemaFilterLeaf<TSchema>>

const trueFilter: QueryConstantFilterNode = immutableRecord({
	kind: 'constant',
	value: true,
})

const falseFilter: QueryConstantFilterNode = immutableRecord({
	kind: 'constant',
	value: false,
})

const constantFilter = (value: boolean): QueryConstantFilterNode =>
	value ? trueFilter : falseFilter

const assertFilterRecord: (
	filter: unknown,
) => asserts filter is Record<string, unknown> & QueryExpressionNode = (
	filter,
) => {
	if (!isPlainRecord(filter)) {
		throw new TypeError('filter must be a query expression')
	}

	assertNonEmptyString(filter.kind, 'filter.kind')
}

const isConstantFilter = (
	filter: QueryFilterExpression,
): filter is QueryConstantFilterNode => filter.kind === 'constant'

const isLogicalGroup = (
	filter: QueryFilterExpression,
	kind: 'and' | 'or',
): filter is QueryAndFilterNode | QueryOrFilterNode =>
	filter.kind === kind && 'expressions' in filter

const withLogicalAncestor = <TResult>(
	filter: object,
	ancestors: WeakSet<object>,
	normalize: () => TResult,
): TResult => {
	if (ancestors.has(filter)) {
		throw new TypeError('logical filter must not contain circular references')
	}

	ancestors.add(filter)

	try {
		return normalize()
	} finally {
		ancestors.delete(filter)
	}
}

const normalizeLogicalGroup = (
	filter: Record<string, unknown>,
	kind: 'and' | 'or',
	ancestors: WeakSet<object>,
): QueryFilterExpression => {
	const sourceExpressions: unknown = filter.expressions

	if (!isUnknownArray(sourceExpressions)) {
		throw new TypeError(`logical ${kind} filter expressions must be an array`)
	}

	return withLogicalAncestor(filter, ancestors, () => {
		const expressions: QueryFilterExpression[] = []
		const identity = kind === 'and'

		for (const expression of sourceExpressions) {
			const normalized = normalizeUnknownLogicalFilter(expression, ancestors)

			if (isConstantFilter(normalized)) {
				if (normalized.value !== identity) {
					return normalized
				}

				continue
			}

			if (isLogicalGroup(normalized, kind)) {
				expressions.push(...normalized.expressions)
			} else {
				expressions.push(normalized)
			}
		}

		if (expressions.length === 0) {
			return constantFilter(identity)
		}

		const firstExpression = expressions[0]

		if (expressions.length === 1 && firstExpression !== undefined) {
			return firstExpression
		}

		return immutableRecord({
			kind,
			expressions: immutableArray(expressions),
		})
	})
}

const normalizeNotFilter = (
	filter: Record<string, unknown>,
	ancestors: WeakSet<object>,
): QueryFilterExpression =>
	withLogicalAncestor(filter, ancestors, () => {
		const expression = normalizeUnknownLogicalFilter(
			filter.expression,
			ancestors,
		)

		if (isConstantFilter(expression)) {
			return constantFilter(!expression.value)
		}

		if (expression.kind === 'not' && 'expression' in expression) {
			return expression.expression
		}

		return immutableRecord({ kind: 'not', expression })
	})

const normalizeUnknownLogicalFilter = (
	filter: unknown,
	ancestors: WeakSet<object>,
): QueryFilterExpression => {
	assertFilterRecord(filter)

	switch (filter.kind) {
		case 'constant':
			if (typeof filter.value !== 'boolean') {
				throw new TypeError('constant filter value must be a boolean')
			}

			return constantFilter(filter.value)
		case 'and':
		case 'or':
			return normalizeLogicalGroup(filter, filter.kind, ancestors)
		case 'not':
			return normalizeNotFilter(filter, ancestors)
		default:
			// Leaf factories own their data snapshots; logical normalization treats them as atoms.
			return filter
	}
}

/** Normalizes logical structure without mutating caller-owned trees or leaf nodes. */
export const normalizeLogicalFilter = <TLeaf extends QueryExpressionNode>(
	filter: QueryFilterExpression<TLeaf>,
): QueryFilterExpression<TLeaf> =>
	normalizeUnknownLogicalFilter(
		filter,
		new WeakSet<object>(),
	) as QueryFilterExpression<TLeaf>

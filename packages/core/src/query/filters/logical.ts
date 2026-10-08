import type { SchemaDefinition } from '../../schema/index.js'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryExpressionNode } from '../ast/contracts.js'
import type { QueryPrimitiveFilterNode } from './primitive.js'
import type { QueryRelationFilterForSchema } from './relation.js'
import { assertPlainObject } from '../../exact-object-validation.js'

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
	QueryPrimitiveFilterNode<TSchema> | QueryRelationFilterForSchema<TSchema>

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

/** Flattens one and/or group while folding its identity and absorbing constants. */
const normalizeLogicalGroup = (
	expressions: readonly unknown[],
	kind: 'and' | 'or',
	ancestors: WeakSet<object>,
): QueryFilterExpression => {
	const identity = kind === 'and'
	const normalized: QueryFilterExpression[] = []

	for (const expression of expressions) {
		const child = normalizeUnknownLogicalFilter(expression, ancestors)

		if (child.kind === 'constant' && 'value' in child) {
			if (child.value !== identity) return child
		} else if (child.kind === kind && 'expressions' in child) {
			normalized.push(...child.expressions)
		} else {
			normalized.push(child)
		}
	}

	const [first] = normalized

	if (first === undefined) return constantFilter(identity)

	return normalized.length === 1
		? first
		: immutableRecord({ kind, expressions: immutableArray(normalized) })
}

const normalizeNotFilter = (
	expression: unknown,
	ancestors: WeakSet<object>,
): QueryFilterExpression => {
	const child = normalizeUnknownLogicalFilter(expression, ancestors)

	if (child.kind === 'constant' && 'value' in child) {
		return constantFilter(!child.value)
	}

	if (child.kind === 'not' && 'expression' in child) {
		return child.expression
	}

	return immutableRecord({ kind: 'not', expression: child })
}

const assertFilterRecord: (
	filter: unknown,
) => asserts filter is Record<string, unknown> & QueryExpressionNode = (
	filter,
) => {
	assertPlainObject(filter, 'filter must be a query expression')

	assertNonEmptyString(filter.kind, 'filter.kind')
}

const withLogicalAncestor = (
	filter: object,
	ancestors: WeakSet<object>,
	normalize: () => QueryFilterExpression,
): QueryFilterExpression => {
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
		case 'or': {
			const { expressions, kind } = filter

			if (!isUnknownArray(expressions)) {
				throw new TypeError(
					`logical ${kind} filter expressions must be an array`,
				)
			}

			return withLogicalAncestor(filter, ancestors, () =>
				normalizeLogicalGroup(expressions, kind, ancestors),
			)
		}
		case 'not':
			return withLogicalAncestor(filter, ancestors, () =>
				normalizeNotFilter(filter.expression, ancestors),
			)
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

import { Pointer, type SchemaDefinition } from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { QueryFilterNode } from './logical.js'
import {
	readWhereOperatorKey,
	type QueryComparisonFilterNode,
	type QueryEqualityFilterNode,
	type QueryJsonPathFilterNode,
	type QueryKeyFilterNode,
	type QueryKeysFilterNode,
	type QueryListEmptyFilterNode,
	type QueryListHasFilterNode,
	type QueryListMembershipFilterNode,
	type QueryMembershipFilterNode,
	type QueryNullFilterNode,
	type QueryRangeFilterNode,
	type QueryRegexFilterNode,
	type QueryStringFilterNode,
	type QueryStructuralContainmentFilterNode,
} from './primitive.js'
import {
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
	type QueryRelationCountComparison,
} from './relation.js'
import type { WhereInput } from './where-contracts.js'

type WhereRecord = Readonly<Record<string, unknown>>

/** Pointer identities serialize back to the target object ID accepted by `where`. */
const serializeIdentity = (value: unknown): unknown =>
	Pointer.is(value) ? value.id : value

const serializeRange = (
	node: Readonly<{ lower?: unknown; upper?: unknown }>,
): WhereRecord => immutableRecord({ lower: node.lower, upper: node.upper })

const serializeCountComparison = (
	comparison: QueryRelationCountComparison,
): readonly [string, unknown] => [
	readWhereOperatorKey(comparison.operator),
	'values' in comparison
		? comparison.values
		: 'value' in comparison
			? comparison.value
			: serializeRange(comparison),
]

type SerializableWherePrimitive =
	| QueryComparisonFilterNode
	| QueryEqualityFilterNode
	| QueryJsonPathFilterNode
	| QueryKeyFilterNode
	| QueryKeysFilterNode
	| QueryListEmptyFilterNode
	| QueryListHasFilterNode
	| QueryListMembershipFilterNode
	| QueryMembershipFilterNode
	| QueryNullFilterNode
	| QueryRangeFilterNode
	| QueryRegexFilterNode
	| QueryStringFilterNode
	| QueryStructuralContainmentFilterNode

/** Restores the canonical operand of one primitive leaf. */
const serializePrimitiveOperand = (
	node: SerializableWherePrimitive,
): unknown => {
	switch (node.kind) {
		case 'between':
		case 'not-between':
			return serializeRange(node)
		case 'in':
		case 'not-in':
		case 'list-has-every':
		case 'list-has-some':
			return immutableArray(node.values.map(serializeIdentity))
		case 'has-all-keys':
		case 'has-any-keys':
			return node.keys
		case 'json-path-exists':
		case 'json-path-matches':
			return immutableRecord({
				source: node.source,
				...(node.variables === undefined ? {} : { variables: node.variables }),
			})
		case 'regex':
			return node.pattern
		case 'null':
		case 'list-empty':
			return true
		default:
			if (!('value' in node)) {
				throw new TypeError('Unsupported where expression kind')
			}

			return serializeIdentity(node.value)
	}
}

const serializeWhereLeaf = (expression: unknown): WhereRecord => {
	if (isQueryRelationCountNode(expression)) {
		const { expression: nested } = expression
		const where =
			nested.kind === 'constant' && nested.value
				? {}
				: { where: serializeWhereExpression(nested) }

		return immutableRecord({
			[expression.field]: immutableRecord({
				count: immutableRecord({
					...Object.fromEntries(
						expression.comparisons.map(serializeCountComparison),
					),
					...where,
				}),
			}),
		})
	}

	if (isQueryRelationPredicateNode(expression)) {
		return immutableRecord({
			[expression.field]: immutableRecord({
				[expression.operator === 'is-not' ? 'isNot' : expression.operator]:
					serializeWhereExpression(expression.expression),
			}),
		})
	}

	// Every other leaf was produced by the primitive factories.
	const node = expression as SerializableWherePrimitive
	const operator =
		node.kind === 'null'
			? node.isNull
				? 'isNull'
				: 'isNotNull'
			: readWhereOperatorKey(node.kind)
	const operatorInput = immutableRecord({
		[operator]: serializePrimitiveOperand(node),
	})

	return 'path' in node
		? immutableRecord({
				[node.field]: immutableRecord({
					at: immutableArray([
						immutableRecord({ path: node.path, ...operatorInput }),
					]),
				}),
			})
		: immutableRecord({ [node.field]: operatorInput })
}

/** Restores the canonical object filter of one normalized expression tree. */
export const serializeWhereExpression = <TSchema extends SchemaDefinition>(
	expression: QueryFilterNode<TSchema>,
): WhereRecord => {
	switch (expression.kind) {
		case 'constant':
			return expression.value
				? immutableRecord({})
				: immutableRecord({ OR: immutableArray([]) })
		case 'and':
		case 'or':
			return immutableRecord({
				[expression.kind.toUpperCase()]: immutableArray(
					expression.expressions.map(serializeWhereExpression),
				),
			})
		case 'not':
			return immutableRecord({
				NOT: serializeWhereExpression(expression.expression),
			})
		default:
			return serializeWhereLeaf(expression)
	}
}

/** Restores the canonical object filter represented by one normalized AST node. */
export const whereInputFromQueryFilter = <
	const TSchema extends SchemaDefinition,
>(
	expression: QueryFilterNode<TSchema>,
): WhereInput<TSchema> => serializeWhereExpression(expression)

import { Pointer, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryFilterNode } from './logical.js'
import {
	readWhereOperatorKey,
	type QueryPrimitiveFilterNode,
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

/** Restores the canonical operand of one primitive leaf. */
const serializePrimitiveOperand = (
	node: QueryPrimitiveFilterNode<SchemaDefinition>,
): unknown => {
	switch (node.kind) {
		case 'between':
		case 'not-between':
			return serializeRange(node)
		case 'in':
		case 'not-in':
		case 'list-has-every':
		case 'list-has-some':
			return immutableArray((node.values ?? []).map(serializeIdentity))
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
	const node = expression as QueryPrimitiveFilterNode<SchemaDefinition>
	const operator =
		node.kind === 'null'
			? node.isNull === true
				? 'isNull'
				: 'isNotNull'
			: readWhereOperatorKey(node.kind)
	const operatorInput = immutableRecord({
		[operator]: serializePrimitiveOperand(node),
	})

	return immutableRecord({
		[node.field]:
			node.path === undefined
				? operatorInput
				: immutableRecord({
						at: immutableArray([
							immutableRecord({ path: node.path, ...operatorInput }),
						]),
					}),
	})
}

/** Places one operator under a root field or under one structured `at` path. */
export const createWhereTargetInput = (
	target: unknown,
	operator: string,
	operand: unknown,
): Readonly<Record<string, unknown>> => {
	if (typeof target === 'string') {
		return immutableRecord({
			[target]: immutableRecord({ [operator]: operand }),
		})
	}

	if (
		!isPlainRecord(target) ||
		target.kind !== 'field-path' ||
		typeof target.field !== 'string' ||
		!isUnknownArray(target.path)
	) {
		throw new TypeError('WhereBuilder target must be a field or field path')
	}

	return immutableRecord({
		[target.field]: immutableRecord({
			at: immutableArray([
				immutableRecord({ path: target.path, [operator]: operand }),
			]),
		}),
	})
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

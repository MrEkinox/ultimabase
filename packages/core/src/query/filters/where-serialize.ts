import { Pointer, type SchemaDefinition } from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import type { QueryFilterNode } from './logical.js'
import {
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
	type QueryRelationFilterNode,
} from './relation.js'
import type {
	QueryComparisonFilterNode,
	QueryEqualityFilterNode,
	QueryJsonPathFilterNode,
	QueryKeyFilterNode,
	QueryKeysFilterNode,
	QueryListEmptyFilterNode,
	QueryListHasFilterNode,
	QueryListMembershipFilterNode,
	QueryMembershipFilterNode,
	QueryNullFilterNode,
	QueryRangeFilterNode,
	QueryRegexFilterNode,
	QueryStringFilterNode,
	QueryStructuralContainmentFilterNode,
} from './primitive.js'
import type { WhereInput } from './where-contracts.js'

const shortOperatorForKind = (kind: string): string => {
	switch (kind) {
		case 'equal':
			return 'eq'
		case 'not-equal':
			return 'ne'
		case 'greater-than':
			return 'gt'
		case 'greater-than-or-equal':
			return 'gte'
		case 'less-than':
			return 'lt'
		case 'less-than-or-equal':
			return 'lte'
		case 'not-between':
			return 'notBetween'
		case 'not-in':
			return 'notIn'
		case 'list-has':
			return 'has'
		case 'list-has-every':
			return 'hasEvery'
		case 'list-has-some':
			return 'hasSome'
		case 'list-empty':
			return 'isEmpty'
		case 'contained-by':
			return 'containedBy'
		case 'starts-with':
			return 'startsWith'
		case 'ends-with':
			return 'endsWith'
		case 'has-key':
			return 'hasKey'
		case 'has-any-keys':
			return 'hasAnyKeys'
		case 'has-all-keys':
			return 'hasAllKeys'
		case 'json-path-exists':
			return 'jsonPathExists'
		case 'json-path-matches':
			return 'jsonPathMatches'
		case 'regex':
			return 'matches'
		default:
			return kind
	}
}

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

const serializeWhereLeaf = (
	expression: SerializableWherePrimitive | QueryRelationFilterNode,
): Readonly<Record<string, unknown>> => {
	if (isQueryRelationCountNode(expression)) {
		const comparisons = Object.fromEntries(
			expression.comparisons.map((comparison): readonly [string, unknown] => {
				const operator = shortOperatorForKind(comparison.operator)

				if (
					comparison.operator === 'between' ||
					comparison.operator === 'not-between'
				) {
					return [
						operator,
						immutableRecord({
							lower: comparison.lower,
							upper: comparison.upper,
						}),
					]
				}

				if (comparison.operator === 'in' || comparison.operator === 'not-in') {
					return [operator, comparison.values]
				}

				if ('value' in comparison) {
					return [operator, comparison.value]
				}

				throw new TypeError('Unsupported relation count comparison')
			}),
		)
		const countInput = immutableRecord({
			...comparisons,
			...(expression.expression.kind === 'constant' &&
			expression.expression.value
				? {}
				: { where: serializeWhereExpression(expression.expression) }),
		})

		return immutableRecord({
			[expression.field]: immutableRecord({
				count: countInput,
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

	const operator =
		expression.kind === 'null'
			? expression.isNull
				? 'isNull'
				: 'isNotNull'
			: shortOperatorForKind(expression.kind)
	let operand: unknown

	if (expression.kind === 'between' || expression.kind === 'not-between') {
		operand = immutableRecord({
			lower: expression.lower,
			upper: expression.upper,
		})
	} else if (
		expression.kind === 'in' ||
		expression.kind === 'not-in' ||
		expression.kind === 'list-has-every' ||
		expression.kind === 'list-has-some'
	) {
		operand = immutableArray(
			expression.values.map((value) => (Pointer.is(value) ? value.id : value)),
		)
	} else if (
		expression.kind === 'has-all-keys' ||
		expression.kind === 'has-any-keys'
	) {
		operand = expression.keys
	} else if (
		expression.kind === 'json-path-exists' ||
		expression.kind === 'json-path-matches'
	) {
		operand = immutableRecord({
			source: expression.source,
			...(expression.variables === undefined
				? {}
				: { variables: expression.variables }),
		})
	} else if (expression.kind === 'regex') {
		operand = expression.pattern
	} else if (expression.kind === 'null' || expression.kind === 'list-empty') {
		operand = true
	} else if ('value' in expression) {
		operand = Pointer.is(expression.value)
			? expression.value.id
			: expression.value
	} else {
		throw new TypeError('Unsupported where expression kind')
	}

	const operatorInput = immutableRecord({ [operator]: operand })

	return 'path' in expression
		? immutableRecord({
				[expression.field]: immutableRecord({
					at: immutableArray([
						immutableRecord({ path: expression.path, ...operatorInput }),
					]),
				}),
			})
		: immutableRecord({ [expression.field]: operatorInput })
}

export const serializeWhereExpression = <TSchema extends SchemaDefinition>(
	expression: QueryFilterNode<TSchema>,
): Readonly<Record<string, unknown>> => {
	switch (expression.kind) {
		case 'constant':
			return expression.value
				? immutableRecord({})
				: immutableRecord({ OR: immutableArray([]) })
		case 'and':
			return immutableRecord({
				AND: immutableArray(
					expression.expressions.map(serializeWhereExpression),
				),
			})
		case 'or':
			return immutableRecord({
				OR: immutableArray(
					expression.expressions.map(serializeWhereExpression),
				),
			})
		case 'not':
			return immutableRecord({
				NOT: serializeWhereExpression(expression.expression),
			})
		default:
			return serializeWhereLeaf(
				expression as unknown as
					SerializableWherePrimitive | QueryRelationFilterNode,
			)
	}
}

/** Restores the canonical object filter represented by one normalized AST node. */
export const whereInputFromQueryFilter = <
	const TSchema extends SchemaDefinition,
>(
	expression: QueryFilterNode<TSchema>,
): WhereInput<TSchema> => serializeWhereExpression(expression)

import { booleanField, Schema, intField } from '@ultimabase/schema'
import { assertNever } from '@ultimabase/shared'
import { expect, expectTypeOf, test } from 'vitest'

import type {
	QueryExpressionNode,
	QueryFilterExpression,
	QueryFilterNode,
	QueryLogicalFilterNode,
} from '../index.js'

const accountSchema = new Schema({
	className: 'Account',
	fields: {
		active: booleanField(),
		age: intField(),
	},
})

interface FixtureLeaf extends QueryExpressionNode {
	readonly kind: 'fixture'
}

const visitLogicalExpression = (
	expression: QueryFilterExpression<FixtureLeaf>,
): string => {
	switch (expression.kind) {
		case 'fixture':
		case 'constant':
			return expression.kind
		case 'and':
		case 'or':
			return expression.expressions.map(visitLogicalExpression).join(',')
		case 'not':
			return visitLogicalExpression(expression.expression)
		default:
			return assertNever(expression)
	}
}

test('recursively composes schema-correlated primitive filters', () => {
	const filter = {
		kind: 'and',
		expressions: [
			{ kind: 'equal', field: 'active', value: true },
			{
				kind: 'or',
				expressions: [
					{ kind: 'greater-than', field: 'age', value: 18 },
					{
						kind: 'not',
						expression: { kind: 'exists', field: 'age', exists: true },
					},
				],
			},
		],
	} as const satisfies QueryFilterNode<typeof accountSchema>

	expect(accountSchema.className).toBe('Account')
	expect(filter.kind).toBe('and')
	expectTypeOf(filter).toExtend<QueryFilterNode<typeof accountSchema>>()
	expectTypeOf<QueryLogicalFilterNode<FixtureLeaf>>().toExtend<
		QueryFilterExpression<FixtureLeaf>
	>()
	expectTypeOf(visitLogicalExpression).returns.toBeString()
})

test('rejects invalid nested fields, values, and leaf kinds', () => {
	type Filters = QueryFilterNode<typeof accountSchema>

	expectTypeOf<{
		readonly kind: 'and'
		readonly expressions: readonly [
			{
				readonly kind: 'equal'
				readonly field: 'missing'
				readonly value: true
			},
		]
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'not'
		readonly expression: {
			readonly kind: 'greater-than'
			readonly field: 'active'
			readonly value: true
		}
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'or'
		readonly expressions: readonly [{ readonly kind: 'transport-filter' }]
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'and'
		readonly pluginPayload: 'reserved-kind'
	}>().not.toExtend<QueryFilterExpression<FixtureLeaf>>()

	const immutableFilter: Filters = {
		kind: 'and',
		expressions: [{ kind: 'equal', field: 'active', value: true }],
	}

	// @ts-expect-error -- Logical expression collections are immutable.
	immutableFilter.expressions = []
})

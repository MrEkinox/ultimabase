import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import type {
	QueryAndFilterNode,
	QueryExpressionNode,
	QueryFilterExpression,
} from '../index.js'
import { normalizeLogicalFilter } from './logical.js'

interface FixtureFilter extends QueryExpressionNode {
	readonly kind: 'fixture'
	readonly name: string
}

const fixtureFilter = (name: string): FixtureFilter =>
	immutableRecord({ kind: 'fixture', name })

describe('normalizeLogicalFilter', () => {
	it('defines algebraic identities for empty groups', () => {
		const emptyAnd = normalizeLogicalFilter<FixtureFilter>({
			kind: 'and',
			expressions: [],
		})
		const emptyOr = normalizeLogicalFilter<FixtureFilter>({
			kind: 'or',
			expressions: [],
		})

		expect(emptyAnd).toStrictEqual({ kind: 'constant', value: true })
		expect(emptyOr).toStrictEqual({ kind: 'constant', value: false })
		expect(Object.isFrozen(emptyAnd)).toBe(true)
		expect(Object.isFrozen(emptyOr)).toBe(true)
	})

	it('flattens matching groups while preserving expression order', () => {
		const first = fixtureFilter('first')
		const second = fixtureFilter('second')
		const third = fixtureFilter('third')
		const input = {
			kind: 'and',
			expressions: [
				first,
				{ kind: 'constant', value: true },
				{
					kind: 'and',
					expressions: [second, { kind: 'and', expressions: [third] }],
				},
			],
		} as const satisfies QueryFilterExpression<FixtureFilter>

		const normalized = normalizeLogicalFilter<FixtureFilter>(input)
		const normalizedOr = normalizeLogicalFilter<FixtureFilter>({
			kind: 'or',
			expressions: [first, { kind: 'or', expressions: [second, third] }],
		})

		expect(normalized).toStrictEqual({
			kind: 'and',
			expressions: [first, second, third],
		})
		expect(Object.isFrozen(normalized)).toBe(true)
		if (normalized.kind === 'and') {
			expect(Object.isFrozen(normalized.expressions)).toBe(true)
		}
		expect(normalizedOr).toStrictEqual({
			kind: 'or',
			expressions: [first, second, third],
		})
	})

	it('folds decisive constants, single groups, and negation', () => {
		const leaf = fixtureFilter('leaf')
		const falseAnd = normalizeLogicalFilter<FixtureFilter>({
			kind: 'and',
			expressions: [leaf, { kind: 'constant', value: false }],
		})
		const trueOr = normalizeLogicalFilter<FixtureFilter>({
			kind: 'or',
			expressions: [leaf, { kind: 'constant', value: true }],
		})
		const singleOr = normalizeLogicalFilter<FixtureFilter>({
			kind: 'or',
			expressions: [{ kind: 'constant', value: false }, leaf],
		})
		const negatedConstant = normalizeLogicalFilter<FixtureFilter>({
			kind: 'not',
			expression: { kind: 'constant', value: true },
		})
		const doubleNegation = normalizeLogicalFilter<FixtureFilter>({
			kind: 'not',
			expression: {
				kind: 'not',
				expression: leaf,
			},
		})
		const negatedLeaf = normalizeLogicalFilter<FixtureFilter>({
			kind: 'not',
			expression: leaf,
		})

		expect(falseAnd).toStrictEqual({ kind: 'constant', value: false })
		expect(trueOr).toStrictEqual({ kind: 'constant', value: true })
		expect(singleOr).toBe(leaf)
		expect(negatedConstant).toStrictEqual({
			kind: 'constant',
			value: false,
		})
		expect(doubleNegation).toBe(leaf)
		expect(negatedLeaf).toStrictEqual({ kind: 'not', expression: leaf })
		expect(Object.isFrozen(negatedLeaf)).toBe(true)
	})

	it('never mutates caller-owned logical containers', () => {
		const first = fixtureFilter('first')
		const second = fixtureFilter('second')
		const nestedExpressions: QueryFilterExpression<FixtureFilter>[] = [first]
		const nested: QueryAndFilterNode<FixtureFilter> = {
			kind: 'and',
			expressions: nestedExpressions,
		}
		const sourceExpressions: QueryFilterExpression<FixtureFilter>[] = [
			nested,
			second,
		]
		const source: QueryAndFilterNode<FixtureFilter> = {
			kind: 'and',
			expressions: sourceExpressions,
		}

		const normalized = normalizeLogicalFilter(source)

		expect(source.expressions).toBe(sourceExpressions)
		expect(nested.expressions).toBe(nestedExpressions)
		expect(sourceExpressions).toStrictEqual([nested, second])
		expect(nestedExpressions).toStrictEqual([first])
		expect(Object.isFrozen(sourceExpressions)).toBe(false)
		expect(normalized).not.toBe(source)
	})

	it('rejects malformed and circular logical structures', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeLogicalFilter(null)
		}).toThrow(new TypeError('filter must be a query expression'))
		expect(() => {
			// @ts-expect-error -- Logical groups require expression collections.
			normalizeLogicalFilter<never>({ kind: 'and', expressions: 'invalid' })
		}).toThrow(new TypeError('logical and filter expressions must be an array'))
		expect(() => {
			// @ts-expect-error -- Constants require boolean truth values.
			normalizeLogicalFilter<never>({ kind: 'constant', value: 'true' })
		}).toThrow(new TypeError('constant filter value must be a boolean'))
		expect(() => {
			// @ts-expect-error -- Negation requires exactly one expression.
			normalizeLogicalFilter<never>({ kind: 'not' })
		}).toThrow(new TypeError('filter must be a query expression'))
		expect(() => {
			const emptyKind: unknown = { kind: '' }

			normalizeLogicalFilter(emptyKind as QueryFilterExpression<FixtureFilter>)
		}).toThrow(new TypeError('filter.kind must be a non-empty string'))

		const circular: { kind: 'or'; expressions: unknown[] } = {
			kind: 'or',
			expressions: [],
		}
		circular.expressions.push(circular)

		expect(() =>
			normalizeLogicalFilter(circular as QueryFilterExpression<FixtureFilter>),
		).toThrow(
			new TypeError('logical filter must not contain circular references'),
		)
	})
})

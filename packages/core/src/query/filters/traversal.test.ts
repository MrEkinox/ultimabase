import { describe, expect, it } from 'vitest'

import { traverseQueryExpression } from './traversal.js'

describe('traverseQueryExpression', () => {
	it('visits logical and wrapped expressions in deterministic depth-first order', () => {
		const visited: string[] = []
		const expression = {
			expression: {
				expression: { field: 'third', kind: 'equal' },
				kind: 'wrapper',
			},
			expressions: [
				{ field: 'first', kind: 'equal' },
				{
					expression: { field: 'second', kind: 'equal' },
					kind: 'not',
				},
			],
			kind: 'and',
		}

		traverseQueryExpression(expression, (candidate) => {
			visited.push(
				typeof candidate.field === 'string'
					? `${candidate.kind}:${candidate.field}`
					: candidate.kind,
			)
			return 'continue'
		})

		expect(visited).toStrictEqual([
			'and',
			'equal:first',
			'not',
			'equal:second',
			'wrapper',
			'equal:third',
		])
	})

	it('lets callers enter or stop at a relation target boundary', () => {
		const relation = {
			expression: {
				expressions: [
					{ field: 'target-first', kind: 'equal' },
					{ field: 'target-second', kind: 'equal' },
				],
				kind: 'and',
			},
			expressions: [{ field: 'malformed-extra', kind: 'equal' }],
			field: 'members',
			kind: 'relation-predicate',
		}
		const entered: string[] = []

		traverseQueryExpression(relation, (candidate, targetDepth) => {
			entered.push(`${candidate.kind}:${String(targetDepth)}`)
			return candidate.kind === 'relation-predicate' ? 'target' : 'continue'
		})

		expect(entered).toStrictEqual([
			'relation-predicate:1',
			'and:2',
			'equal:2',
			'equal:2',
		])

		const stopped: string[] = []
		traverseQueryExpression(relation, (candidate) => {
			stopped.push(candidate.kind)
			return 'skip'
		})
		expect(stopped).toStrictEqual(['relation-predicate'])
	})

	it('ignores malformed child containers before visiting a typed node', () => {
		const visited: string[] = []
		const expression = {
			expression: { kind: 1 },
			expressions: [null, 'invalid', { kind: 2 }, { kind: 'valid' }],
			kind: 'wrapper',
		}

		traverseQueryExpression(expression, (candidate) => {
			visited.push(candidate.kind)
			return 'continue'
		})

		expect(visited).toStrictEqual(['wrapper', 'valid'])
	})

	it('rejects circular expression containers without retaining shared siblings', () => {
		const shared = { kind: 'shared' }
		const reusable = {
			expressions: [shared, shared],
			kind: 'and',
		}
		const visited: string[] = []

		traverseQueryExpression(reusable, (candidate) => {
			visited.push(candidate.kind)
			return 'continue'
		})
		expect(visited).toStrictEqual(['and', 'shared', 'shared'])

		const circular: Record<string, unknown> = { kind: 'not' }
		circular.expression = circular

		expect(() => {
			traverseQueryExpression(circular, () => 'continue')
		}).toThrow('relation predicate must not contain circular references')
	})
})

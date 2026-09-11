import {
	Schema,
	SchemaRegistry,
	stringField,
	type SchemaDefinition,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import type { QueryExpressionNode } from '../ast/contracts.js'
import {
	collectQueryRelationPredicates,
	createQueryRelationCount,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
	queryRelationPredicateMaxCount,
	queryRelationPredicateMaxDepth,
} from './relation.js'
import { WhereBuilder } from './where.js'
import { QueryBuilder } from '../query/query.js'

const Member = Schema.define({
	className: 'RelationPredicateMember',
	fields: (field) => ({
		active: field.boolean(),
		metadata: field.json(),
		name: field.string(),
		score: field.int(),
	}),
})
const Team = Schema.define({
	className: 'RelationPredicateTeam',
	fields: (field) => ({
		members: field.relation({ target: 'RelationPredicateMember' }),
		name: field.string(),
	}),
})
const Company = Schema.define({
	className: 'RelationPredicateCompany',
	fields: (field) => ({
		lead: field.pointer({ target: 'RelationPredicateTeam' }),
		name: field.string(),
		teams: field.relation({ target: 'RelationPredicateTeam' }),
	}),
})

const recursiveNameField = stringField()
const Recursive = Schema.define({
	className: 'RecursiveRelationPredicate',
	fields: (field) => ({
		children: field.relation({ target: 'RecursiveRelationPredicate' }),
		name: recursiveNameField,
	}),
})

new SchemaRegistry([Member, Team, Company, Recursive]).resolveSchemaTargets()

const nestRecursivePredicate = (
	predicate: WhereBuilder<SchemaDefinition>,
	remaining: number,
): WhereBuilder<SchemaDefinition> =>
	remaining === 0
		? predicate
		: predicate.some('children', (child) =>
				nestRecursivePredicate(child, remaining - 1),
			)

describe('relation predicates', () => {
	it('normalizes nested quantifiers into immutable schema-correlated nodes', () => {
		const base = new QueryBuilder(Company)
		const filtered = base.where((where) =>
			where.some('teams', (team) =>
				team
					.eq('name', 'Core')
					.some('members', (member) =>
						member.between('name', 'A', 'M').eq('active', true),
					),
			),
		)
		const expression = filtered.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Relation predicate fixture requires an expression')
		}

		const predicates = collectQueryRelationPredicates(expression)

		expect(base.ast.where).toBeUndefined()
		expect(predicates).toHaveLength(2)
		expect(predicates[0]).toMatchObject({
			field: 'teams',
			kind: 'relation-predicate',
			operator: 'some',
			source: { definition: Company, kind: 'schema' },
			target: { definition: Team, kind: 'schema' },
		})
		expect(predicates[1]).toMatchObject({
			expression: {
				expressions: [
					{
						field: 'name',
						kind: 'between',
						lower: 'A',
						upper: 'M',
					},
					{ field: 'active', kind: 'equal', value: true },
				],
				kind: 'and',
			},
			field: 'members',
			operator: 'some',
			source: { definition: Team },
			target: { definition: Member },
		})
		expect(Object.isFrozen(filtered)).toBe(true)
		expect(Object.isFrozen(expression)).toBe(true)
		expect(Object.isFrozen(predicates)).toBe(true)
	})

	it('preserves empty-set quantifier semantics as explicit true predicates', () => {
		const some = new QueryBuilder(Company).where((where) =>
			where.some('teams', (team) => team),
		)
		const none = new QueryBuilder(Company).where((where) =>
			where.none('teams', (team) => team),
		)
		const every = new QueryBuilder(Company).where((where) =>
			where.every('teams', (team) => team),
		)

		for (const [query, operator] of [
			[some, 'some'],
			[none, 'none'],
			[every, 'every'],
		] as const) {
			expect(query.ast.where?.expression).toMatchObject({
				expression: { kind: 'constant', value: true },
				operator,
			})
		}
	})

	it('supports the complete target filter vocabulary inside nested quantifiers', () => {
		const query = new QueryBuilder(Company).where((where) =>
			where.some('teams', (team) =>
				team.some('members', (member) =>
					member
						.eq('active', true)
						.ne('name', 'Archived')
						.gt('score', 0)
						.gte('score', 1)
						.lt('score', 100)
						.lte('score', 99)
						.between('score', 10, 20)
						.notBetween('score', 30, 40)
						.in('name', ['Core', 'Runtime'])
						.notIn('name', ['Legacy'])
						.contains('name', 'or')
						.contains('metadata', { category: 'core' })
						.containedBy('metadata', { category: 'core', stable: true })
						.hasKey('metadata', 'category')
						.hasAnyKeys('metadata', ['category', 'owner'])
						.hasAllKeys('metadata', ['category', 'stable'])
						.jsonPathExists('metadata', { source: '$.category' })
						.jsonPathMatches('metadata', { source: '$.stable == true' })
						.startsWith('name', 'Co')
						.endsWith('name', 're')
						.matches('name', { flags: [], source: '^Core$' })
						.isNull('name')
						.isNotNull('metadata')
						.and({ active: { eq: true } })
						.or({ name: { eq: 'Fallback' } })
						.not({ score: { lt: 0 } }),
				),
			),
		)
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Complete relation filter fixture is incomplete')
		}

		const serialized = JSON.stringify(expression)
		const expectedKinds = [
			'contained-by',
			'contains',
			'equal',
			'greater-than',
			'greater-than-or-equal',
			'has-all-keys',
			'has-any-keys',
			'has-key',
			'in',
			'json-path-exists',
			'json-path-matches',
			'less-than',
			'less-than-or-equal',
			'not-between',
			'not-equal',
			'not-in',
			'null',
			'regex',
			'starts-with',
			'ends-with',
		] as const

		for (const kind of expectedKinds) {
			expect(serialized).toContain(`"kind":"${kind}"`)
		}
		expect(collectQueryRelationPredicates(expression)).toHaveLength(2)
	})

	it('normalizes every visible-cardinality comparison into one immutable node', () => {
		const query = new QueryBuilder(Company).where({
			teams: {
				count: {
					between: { lower: 1, upper: 4 },
					eq: 2,
					gt: 0,
					gte: 1,
					in: [1, 2],
					lt: 5,
					lte: 4,
					ne: 3,
					notBetween: { lower: 6, upper: 8 },
					notIn: [0, 5],
				},
			},
		})
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Complete relation count fixture is incomplete')
		}

		const [count] = collectQueryRelationPredicates(expression)

		expect(isQueryRelationCountNode(count)).toBe(true)

		if (!isQueryRelationCountNode(count)) {
			throw new TypeError('Complete relation count fixture omitted its node')
		}

		expect(count).toMatchObject({
			comparisons: [
				{ lower: 1, operator: 'between', upper: 4 },
				{ operator: 'equal', value: 2 },
				{ operator: 'greater-than', value: 0 },
				{ operator: 'greater-than-or-equal', value: 1 },
				{ operator: 'in', values: [1, 2] },
				{ operator: 'less-than', value: 5 },
				{ operator: 'less-than-or-equal', value: 4 },
				{ operator: 'not-equal', value: 3 },
				{ lower: 6, operator: 'not-between', upper: 8 },
				{ operator: 'not-in', values: [0, 5] },
			],
			expression: { kind: 'constant', value: true },
			field: 'teams',
			kind: 'relation-count',
		})
		expect(Object.isFrozen(count)).toBe(true)
		expect(Object.isFrozen(count.comparisons)).toBe(true)
	})

	it('collects visible-cardinality leaves beside nested quantifiers', () => {
		const query = new QueryBuilder(Company).where((where) =>
			where
				.count('teams', {
					where: { members: { some: { active: { eq: true } } } },
					gte: 2,
				})
				.some('teams', (team) => team.count('members', { eq: 3 })),
		)
		const expression = query.ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Relation count fixture requires an expression')
		}

		const predicates = collectQueryRelationPredicates(expression)

		expect(predicates).toHaveLength(4)
		expect(predicates[0]).toMatchObject({
			comparisons: [
				{
					operator: 'greater-than-or-equal',
					value: 2,
				},
			],
			field: 'teams',
			kind: 'relation-count',
		})
		expect(predicates[1]).toMatchObject({
			field: 'members',
			kind: 'relation-predicate',
			operator: 'some',
		})
		expect(predicates[3]).toMatchObject({
			comparisons: [{ operator: 'equal', value: 3 }],
			field: 'members',
			kind: 'relation-count',
		})
	})

	it('rejects malformed cardinality operands and non-relation targets', () => {
		const targetExpression = new QueryBuilder(Team).where({
			name: { eq: 'Core' },
		}).ast.where?.expression

		if (targetExpression === undefined) {
			throw new TypeError('Relation count validation fixture is incomplete')
		}

		expect(() =>
			createQueryRelationCount(
				Company,
				'name' as 'teams',
				{ eq: 1 },
				targetExpression,
			),
		).toThrow('relation count field must reference a relation')
		expect(() =>
			createQueryRelationCount(
				Company,
				'teams',
				{ median: 1 } as never,
				targetExpression,
			),
		).toThrow('relation count operator is unsupported: median')
		expect(() =>
			createQueryRelationCount(Company, 'teams', {}, targetExpression),
		).toThrow('relation count must contain an operator')

		const malformedInputs: readonly {
			readonly input: unknown
			readonly message: string
		}[] = [
			{
				input: { teams: { count: { eq: Number.MAX_SAFE_INTEGER + 1 } } },
				message: 'must be a non-negative safe integer',
			},
			{
				input: { teams: { count: { in: 1 } } },
				message: 'relation count in must be an array',
			},
			{
				input: { teams: { count: { notIn: [0, -1] } } },
				message: 'relation count not-in[1] must be a non-negative safe integer',
			},
			{
				input: { teams: { count: { between: { lower: 1 } } } },
				message: 'relation count between must contain only lower and upper',
			},
			{
				input: {
					teams: { count: { notBetween: { lower: -1, upper: 2 } } },
				},
				message:
					'relation count not-between.lower must be a non-negative safe integer',
			},
		]

		for (const { input, message } of malformedInputs) {
			expect(() => new QueryBuilder(Company).where(input as never)).toThrow(
				message,
			)
		}
	})

	it('narrows only complete relation predicate and cardinality AST nodes', () => {
		const expression = new QueryBuilder(Company).where({
			lead: {
				is: { name: { eq: 'Core' } },
				isNot: { name: { eq: 'Legacy' } },
			},
			teams: {
				count: { in: [1, 2], notBetween: { lower: 4, upper: 8 } },
				every: { name: { isNotNull: true } },
				none: { name: { eq: 'Archived' } },
				some: { name: { eq: 'Core' } },
			},
		}).ast.where?.expression

		if (expression === undefined) {
			throw new TypeError('Relation AST guard fixture is incomplete')
		}

		const nodes = collectQueryRelationPredicates(expression)
		const count = nodes.find(isQueryRelationCountNode)
		const predicate = nodes.find(isQueryRelationPredicateNode)

		if (count === undefined || predicate === undefined) {
			throw new TypeError('Relation AST guard fixture omitted a node')
		}

		expect(nodes.filter(isQueryRelationPredicateNode)).toHaveLength(5)
		expect(isQueryRelationCountNode(count)).toBe(true)
		expect(isQueryRelationPredicateNode(predicate)).toBe(true)

		const invalidCounts: readonly unknown[] = [
			null,
			{},
			{ ...count, kind: 'relation-predicate' },
			{ ...count, field: 1 },
			{ ...count, source: {} },
			{ ...count, source: { ...count.source, kind: 'invalid' } },
			{ ...count, target: {} },
			{ ...count, target: { ...count.target, definition: {} } },
			{ ...count, comparisons: [] },
			{ ...count, comparisons: [null] },
			{ ...count, comparisons: [{ operator: 'equal', value: -1 }] },
			{ ...count, comparisons: [{ operator: 'in', values: 1 }] },
			{ ...count, comparisons: [{ operator: 'not-in', values: [0, -1] }] },
			{
				...count,
				comparisons: [{ lower: 0, operator: 'between', upper: -1 }],
			},
			{ ...count, comparisons: [{ operator: 'unsupported', value: 1 }] },
			{ ...count, expression: null },
		]

		for (const invalid of invalidCounts) {
			expect(isQueryRelationCountNode(invalid)).toBe(false)
		}

		const invalidPredicates: readonly unknown[] = [
			null,
			{},
			{ ...predicate, kind: 'relation-count' },
			{ ...predicate, operator: 'invalid' },
			{ ...predicate, field: 1 },
			{ ...predicate, source: {} },
			{ ...predicate, source: { ...predicate.source, definition: {} } },
			{ ...predicate, target: {} },
			{ ...predicate, target: { ...predicate.target, kind: 'invalid' } },
			{ ...predicate, expression: null },
		]

		for (const invalid of invalidPredicates) {
			expect(isQueryRelationPredicateNode(invalid)).toBe(false)
		}
	})

	it('rejects circular and over-depth relation ASTs during collection', () => {
		const expression = new QueryBuilder(Company).where({
			teams: { some: { name: { eq: 'Core' } } },
		}).ast.where?.expression

		if (expression === undefined || !isQueryRelationPredicateNode(expression)) {
			throw new TypeError('Relation collection fixture is incomplete')
		}

		const circular: Record<string, unknown> = { kind: 'not' }
		circular.expression = circular

		expect(() =>
			collectQueryRelationPredicates(
				circular as unknown as QueryExpressionNode,
			),
		).toThrow('relation predicate must not contain circular references')

		let nested = {
			kind: 'constant',
			value: true,
		} as unknown as QueryExpressionNode

		for (let depth = 0; depth < queryRelationPredicateMaxDepth; depth += 1) {
			nested = {
				...expression,
				expression: nested,
			} as unknown as QueryExpressionNode
		}

		expect(() => collectQueryRelationPredicates(nested)).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'query-relation-depth-exceeded' },
			}),
		)

		const logical = {
			expression,
			expressions: [null, { kind: 1 }, expression],
			kind: 'and',
		} as unknown as QueryExpressionNode

		expect(collectQueryRelationPredicates(logical)).toHaveLength(2)
	})

	it('rejects relation ASTs above the portable occurrence budget', () => {
		const predicates = Array.from(
			{ length: queryRelationPredicateMaxCount + 1 },
			(_, index) => {
				const expression = new QueryBuilder(Company).where({
					teams: { some: { name: { eq: `Team ${String(index)}` } } },
				}).ast.where?.expression

				if (expression === undefined) {
					throw new TypeError('Relation complexity fixture is incomplete')
				}

				return expression
			},
		)
		const withinBudget = {
			expressions: predicates.slice(0, queryRelationPredicateMaxCount),
			kind: 'and' as const,
		}
		const aboveBudget = {
			expressions: predicates,
			kind: 'and' as const,
		}

		expect(collectQueryRelationPredicates(withinBudget)).toHaveLength(
			queryRelationPredicateMaxCount,
		)
		expect(() => collectQueryRelationPredicates(aboveBudget)).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'query-relation-complexity-exceeded' },
			}),
		)
	})

	it('rejects relation builders created for another target schema', () => {
		expect(() =>
			new QueryBuilder(Company).where((where) =>
				where.some(
					'teams',
					// @ts-expect-error -- Runtime still rejects dynamically mismatched builders.
					() => new WhereBuilder(Member),
				),
			),
		).toThrow(new TypeError('WhereBuilder must use the same schema definition'))
	})

	it('fails with a typed framework error above the portable depth limit', () => {
		expect(() =>
			new QueryBuilder(Recursive).where((where) =>
				where.some('children', (child) => nestRecursivePredicate(child, 8)),
			),
		).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'query-relation-depth-exceeded' },
			}),
		)
	})
})

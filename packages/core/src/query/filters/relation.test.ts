import {
	Schema,
	stringField,
	type RelationField,
	type SchemaClass,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { collectQueryRelationPredicates } from './relation.js'
import { WhereBuilder } from './where.js'
import { QueryBuilder } from '../query/query.js'

const Member = Schema.define({
	className: 'RelationPredicateMember',
	fields: (field) => ({ active: field.boolean(), name: field.string() }),
})
const Team = Schema.define({
	className: 'RelationPredicateTeam',
	fields: (field) => ({
		members: field.relation({ target: () => Member }),
		name: field.string(),
	}),
})
const Company = Schema.define({
	className: 'RelationPredicateCompany',
	fields: (field) => ({
		name: field.string(),
		teams: field.relation({ target: () => Team }),
	}),
})

const recursiveNameField = stringField()
type RecursiveSchema = SchemaClass<
	'RecursiveRelationPredicate',
	Readonly<{
		readonly children: RelationField<RecursiveSchema, undefined>
		readonly name: typeof recursiveNameField
	}>,
	readonly []
>
const resolveRecursiveSchema = (): RecursiveSchema => Recursive
const Recursive: RecursiveSchema = Schema.define({
	className: 'RecursiveRelationPredicate',
	fields: (field) => ({
		children: field.relation({ target: resolveRecursiveSchema }),
		name: recursiveNameField,
	}),
})

const nestRecursivePredicate = (
	predicate: WhereBuilder<RecursiveSchema>,
	remaining: number,
): WhereBuilder<RecursiveSchema> =>
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

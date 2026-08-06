import {
	booleanField,
	relationField,
	Schema,
	stringField,
	type RelationField,
	type SchemaClass,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { collectQueryRelationPredicates } from './relation.js'
import { WhereBuilder } from './where.js'

const Member = Schema.define({
	className: 'RelationPredicateMember',
	fields: { active: booleanField(), name: stringField() },
})
const Team = Schema.define({
	className: 'RelationPredicateTeam',
	fields: {
		members: relationField({ target: () => Member }),
		name: stringField(),
	},
})
const Company = Schema.define({
	className: 'RelationPredicateCompany',
	fields: {
		name: stringField(),
		teams: relationField({ target: () => Team }),
	},
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
	fields: {
		children: relationField({ target: resolveRecursiveSchema }),
		name: recursiveNameField,
	},
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
		const base = Company.query()
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
		const some = Company.query().where((where) =>
			where.some('teams', (team) => team),
		)
		const none = Company.query().where((where) =>
			where.none('teams', (team) => team),
		)
		const every = Company.query().where((where) =>
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

	it('rejects relation builders created for another target schema', () => {
		expect(() =>
			Company.query().where((where) =>
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
			Recursive.query().where((where) =>
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

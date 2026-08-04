import {
	booleanField,
	relationField,
	Schema,
	stringField,
	type RelationField,
	type SchemaClass,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	collectQueryRelationPredicates,
	RelationPredicate,
} from './relation.js'

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
	predicate: RelationPredicate<RecursiveSchema>,
	remaining: number,
): RelationPredicate<RecursiveSchema> =>
	remaining === 0
		? predicate
		: predicate.some('children', (child) =>
				nestRecursivePredicate(child, remaining - 1),
			)

describe('relation predicates', () => {
	it('normalizes nested quantifiers into immutable schema-correlated nodes', () => {
		const base = Company.query()
		const filtered = base.some('teams', (team) =>
			team
				.equalTo('name', 'Core')
				.some('members', (member) => member.equalTo('active', true)),
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
		const some = Company.query().some('teams', (team) => team)
		const none = Company.query().none('teams', (team) => team)
		const every = Company.query().every('teams', (team) => team)

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

	it('rejects callbacks returning another target builder', () => {
		expect(() =>
			// @ts-expect-error -- Runtime still rejects dynamically mismatched builders.
			Company.query().some('teams', () => new RelationPredicate(Member)),
		).toThrow(
			new TypeError(
				'relation predicate callback must return the target predicate builder',
			),
		)
	})

	it('fails with a typed framework error above the portable depth limit', () => {
		expect(() =>
			Recursive.query().some('children', (child) =>
				nestRecursivePredicate(child, 8),
			),
		).toThrow(
			expect.objectContaining({
				code: 'VALIDATION_ERROR',
				internalDetails: { kind: 'query-relation-depth-exceeded' },
			}),
		)
	})
})

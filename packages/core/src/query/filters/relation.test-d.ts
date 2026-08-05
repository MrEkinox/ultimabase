import {
	booleanField,
	intField,
	relationField,
	Schema,
	stringField,
} from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { Query } from '../query/query.js'
import type { RelationPredicate } from './relation.js'

const Target = Schema.define({
	className: 'TypedRelationPredicateTarget',
	fields: { active: booleanField(), label: stringField(), score: intField() },
})
const Source = Schema.define({
	className: 'TypedRelationPredicateSource',
	fields: {
		name: stringField(),
		targets: relationField({ target: () => Target }),
	},
})

test('exposes only exact target filter capabilities inside relation predicates', () => {
	const query = Source.query().some('targets', (target) => {
		expectTypeOf(target).toEqualTypeOf<RelationPredicate<typeof Target>>()
		target.equalTo('active', true)
		target.contains('label', 'typed')
		target.between('score', 10, 20)
		target.notBetween('score', 30, 40)

		// @ts-expect-error -- Range filters reject unordered target fields.
		target.between('active', false, true)

		// @ts-expect-error -- Source fields never leak into the target predicate.
		target.equalTo('name', 'invalid')
		expectTypeOf<'find'>().not.toExtend<keyof typeof target>()
		expectTypeOf<'select'>().not.toExtend<keyof typeof target>()
		expectTypeOf<'useMasterKey'>().not.toExtend<keyof typeof target>()

		return target.equalTo('active', true)
	})

	expectTypeOf(query).toEqualTypeOf<Query<typeof Source>>()

	// @ts-expect-error -- Scalar fields cannot be quantified as relations.
	Source.query().some('name', (target) => target)
})

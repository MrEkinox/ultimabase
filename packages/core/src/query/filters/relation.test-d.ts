import {
	booleanField,
	intField,
	objectField,
	relationField,
	Schema,
	stringField,
} from '../../schema/index.js'
import { expectTypeOf, test } from 'vitest'

import type { Query } from '../query/query.js'
import { fieldPath } from './factory.js'
import type { RelationPredicate } from './relation.js'

const Target = Schema.define({
	className: 'TypedRelationPredicateTarget',
	fields: {
		active: booleanField(),
		label: stringField(),
		metadata: objectField({ fields: { category: stringField() } }),
		score: intField(),
	},
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
		target
			.contains('metadata', { category: 'typed' })
			.hasKey('metadata', 'category')
			.jsonPathExists('metadata', {
				source: '$.category ? (@ == $expected)',
				variables: { expected: 'typed' },
			})
			.equalTo(fieldPath('metadata', ['category']), 'typed')

		// @ts-expect-error -- Range filters reject unordered target fields.
		target.between('active', false, true)

		// @ts-expect-error -- Source fields never leak into the target predicate.
		target.equalTo('name', 'invalid')
		// @ts-expect-error -- Object paths retain the target child type.
		target.equalTo(fieldPath('metadata', ['category']), 42)
		// @ts-expect-error -- JSONPath cannot target ordinary scalar fields.
		target.jsonPathMatches('label', { source: '$ == "typed"' })
		expectTypeOf<'find'>().not.toExtend<keyof typeof target>()
		expectTypeOf<'select'>().not.toExtend<keyof typeof target>()
		expectTypeOf<'useMasterKey'>().not.toExtend<keyof typeof target>()

		return target.equalTo('active', true)
	})

	expectTypeOf(query).toEqualTypeOf<Query<typeof Source>>()

	// @ts-expect-error -- Scalar fields cannot be quantified as relations.
	Source.query().some('name', (target) => target)
})

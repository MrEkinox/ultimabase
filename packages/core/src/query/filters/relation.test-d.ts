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
import type { WhereBuilder } from './where.js'

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
	const query = Source.query().where((where) =>
		where.some('targets', (target) => {
			expectTypeOf(target).toEqualTypeOf<WhereBuilder<typeof Target>>()
			target.eq('active', true)
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
				.eq(fieldPath('metadata', ['category']), 'typed')

			// @ts-expect-error -- Range filters reject unordered target fields.
			target.between('active', false, true)

			// @ts-expect-error -- Source fields never leak into the target predicate.
			target.eq('name', 'invalid')
			// @ts-expect-error -- Object paths retain the target child type.
			target.eq(fieldPath('metadata', ['category']), 42)
			// @ts-expect-error -- JSONPath cannot target ordinary scalar fields.
			target.jsonPathMatches('label', { source: '$ == "typed"' })
			expectTypeOf<'findMany'>().not.toExtend<keyof typeof target>()
			expectTypeOf<'select'>().not.toExtend<keyof typeof target>()
			expectTypeOf<'useMasterKey'>().not.toExtend<keyof typeof target>()

			return target.eq('active', true)
		}),
	)

	expectTypeOf(query).toEqualTypeOf<Query<typeof Source>>()

	// @ts-expect-error -- Scalar fields cannot be quantified as relations.
	Source.query().where((where) => where.some('name', (target) => target))
})

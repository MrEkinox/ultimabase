import {
	Schema,
	booleanField,
	enumField,
	intField,
	objectField,
	stringField,
} from '../index.js'
import { expectTypeOf, test } from 'vitest'
import { fieldPath } from '../../query/index.js'

import type { AccessFilter } from './contracts.js'
import { createAccessFilter } from './filter.js'

const Article = Schema.define({
	className: 'TypedAccessFilterArticle',
	fields: {
		aliases: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
		published: booleanField(),
		score: intField(),
		status: enumField({ values: ['draft', 'published'] }),
		title: stringField(),
		views: intField(),
	},
})

test('correlates every Access predicate with exact schema capabilities', () => {
	const filter = createAccessFilter(Article)

	expectTypeOf(filter).toEqualTypeOf<AccessFilter<typeof Article>>()
	expectTypeOf(
		filter
			.equalTo('published', true)
			.notEqualTo('status', 'draft')
			.greaterThan('views', 10)
			.greaterThanOrEqualTo('views', 10)
			.lessThan('views', 100)
			.lessThanOrEqualTo('views', 100)
			.between('views', 10, 100)
			.notBetween('views', 10, 100)
			.containedIn('status', ['draft', 'published'])
			.notContainedIn('status', ['draft'])
			.contains('title', 'Base')
			.startsWith('title', 'Ultima')
			.endsWith('title', 'Base')
			.matches('title', {
				flags: ['case-insensitive'],
				source: '^Ultima',
			})
			.isNotNull('metadata')
			.isNull('aliases'),
	).toEqualTypeOf<AccessFilter<typeof Article>>()

	filter.equalTo('score', null)
	filter
		.contains('metadata', { label: 'typed' })
		.containedBy('metadata', { label: 'typed' })
		.hasKey('metadata', 'label')
		.hasAnyKeys('metadata', ['label'])
		.hasAllKeys('metadata', ['label'])
		.jsonPathExists('metadata', {
			source: '$.items[*] ? (@.price > $minimum)',
			variables: { minimum: 10 },
		})
		.jsonPathMatches('metadata', { source: '$.label == "typed"' })
		.equalTo(fieldPath('metadata', ['label']), 'typed')

	// @ts-expect-error -- Boolean operands remain booleans.
	filter.equalTo('published', 'true')
	// @ts-expect-error -- Enum operands remain their exact literal union.
	filter.equalTo('status', 'archived')
	// @ts-expect-error -- Ordered comparisons reject boolean fields.
	filter.greaterThan('published', true)
	// @ts-expect-error -- Ordered comparisons reject nullable null operands.
	filter.greaterThan('score', null)
	// @ts-expect-error -- Range bounds reject nullable null operands.
	filter.between('score', null, 100)
	// @ts-expect-error -- Range filters reject unordered fields.
	filter.notBetween('published', false, true)
	// @ts-expect-error -- Membership values stay correlated with the enum.
	filter.containedIn('status', ['archived'])
	// @ts-expect-error -- String operators reject numeric fields.
	filter.contains('views', '10')
	// @ts-expect-error -- Typed objects reject undeclared containment properties.
	filter.contains('metadata', { missing: true })
	// @ts-expect-error -- Typed object key operators reject undeclared keys.
	filter.hasKey('metadata', 'missing')
	// @ts-expect-error -- JSONPath cannot target ordinary scalar fields.
	filter.jsonPathExists('views', { source: '$' })
	// @ts-expect-error -- Regex filters reject non-string fields.
	filter.matches('views', { flags: [], source: '10' })
	// @ts-expect-error -- Equality does not apply to list fields.
	filter.equalTo('aliases', ['alias'])
	expectTypeOf<'find'>().not.toExtend<keyof typeof filter>()
	expectTypeOf<'select'>().not.toExtend<keyof typeof filter>()
	expectTypeOf<'ascending'>().not.toExtend<keyof typeof filter>()
	expectTypeOf<'limit'>().not.toExtend<keyof typeof filter>()
})

test('restricts logical composition to one exact schema identity type', () => {
	const filter = createAccessFilter(Article)
	const Comment = Schema.define({
		className: 'TypedAccessFilterComment',
		fields: { body: stringField() },
	})

	filter.and(filter.equalTo('published', true))
	filter.or(filter.equalTo('published', false))
	filter.not(filter.equalTo('status', 'draft'))

	// @ts-expect-error -- Logical branches must use the same schema type.
	filter.and(createAccessFilter(Comment).equalTo('body', 'Comment'))
})

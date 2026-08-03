import {
	Schema,
	booleanField,
	enumField,
	intField,
	objectField,
	stringField,
} from '../index.js'
import { expectTypeOf, test } from 'vitest'

import type { AccessFilter } from './contracts.js'
import { createAccessFilter } from './filter.js'

const Article = Schema.define({
	className: 'TypedAccessFilterArticle',
	fields: {
		aliases: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
		published: booleanField(),
		score: intField({ validation: { nullable: true } }),
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
			.containedIn('status', ['draft', 'published'])
			.notContainedIn('status', ['draft'])
			.contains('title', 'Base')
			.startsWith('title', 'Ultima')
			.endsWith('title', 'Base')
			.matches('title', {
				flags: ['case-insensitive'],
				source: '^Ultima',
			})
			.exists('metadata')
			.doesNotExist('aliases'),
	).toEqualTypeOf<AccessFilter<typeof Article>>()

	filter.equalTo('score', null)

	// @ts-expect-error -- Boolean operands remain booleans.
	filter.equalTo('published', 'true')
	// @ts-expect-error -- Enum operands remain their exact literal union.
	filter.equalTo('status', 'archived')
	// @ts-expect-error -- Ordered comparisons reject boolean fields.
	filter.greaterThan('published', true)
	// @ts-expect-error -- Ordered comparisons reject nullable null operands.
	filter.greaterThan('score', null)
	// @ts-expect-error -- Membership values stay correlated with the enum.
	filter.containedIn('status', ['archived'])
	// @ts-expect-error -- String operators reject numeric fields.
	filter.contains('views', '10')
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

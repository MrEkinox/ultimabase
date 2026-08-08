import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	booleanField,
	enumField,
	intField,
	objectField,
	pointerField,
	relationField,
	stringField,
} from '../index.js'
import type { WhereBuilder, WhereInput } from '../../query/index.js'
import { createAccessWhere } from './filter.js'

const Author = Schema.define({
	className: 'TypedAccessWhereAuthor',
	fields: { active: booleanField(), name: stringField() },
})
const Tag = Schema.define({
	className: 'TypedAccessWhereTag',
	fields: { label: stringField(), visible: booleanField() },
})
const Article = Schema.define({
	className: 'TypedAccessWhereArticle',
	fields: {
		aliases: stringField({ list: true }),
		author: pointerField({ target: () => Author }),
		metadata: objectField({ fields: { label: stringField() } }),
		published: booleanField(),
		score: intField(),
		status: enumField({ values: ['draft', 'published'] }),
		tags: relationField({ target: () => Tag }),
		title: stringField(),
		views: intField(),
	},
})

test('types Access objects and builders through the public where contract', () => {
	const where = createAccessWhere(Article)
	const object = {
		author: { is: { active: { eq: true } } },
		published: { eq: true },
		status: { in: ['draft', 'published'] },
		tags: {
			count: { gte: 2, where: { visible: { eq: true } } },
			some: { label: { startsWith: 'core-' } },
		},
		views: { gte: 10 },
	} as const satisfies WhereInput<typeof Article>

	expectTypeOf(where).toEqualTypeOf<WhereBuilder<typeof Article>>()
	expectTypeOf(object).toExtend<WhereInput<typeof Article>>()
	where
		.eq('score', null)
		.is('author', (author) => author.eq('active', true))
		.some('tags', (tag) => tag.eq('visible', true))

	// @ts-expect-error -- Boolean operands remain booleans.
	where.eq('published', 'true')
	// @ts-expect-error -- Enum operands remain their exact literal union.
	where.eq('status', 'archived')
	// @ts-expect-error -- Ordered comparisons reject boolean fields.
	where.gt('published', true)
	// @ts-expect-error -- Relation predicates retain target field inference.
	where.some('tags', (tag) => tag.eq('missing', true))
	// @ts-expect-error -- Pointer predicates retain target value inference.
	where.is('author', (author) => author.eq('active', 'true'))
})

test('contextually types direct Access where object results', () => {
	Schema.define({
		className: 'ContextualAccessWhereArticle',
		access: {
			filter: {
				read: () => ({
					published: { eq: true },
					views: { gte: 10 },
				}),
				update: ({ where }) => where.eq('published', true),
			},
		},
		fields: { published: booleanField(), views: intField() },
	})

	Schema.define({
		className: 'InvalidContextualAccessWhereArticle',
		access: {
			filter: {
				// @ts-expect-error -- Direct policy objects retain exact field names.
				read: () => ({ missing: { eq: true } }),
			},
		},
		fields: { published: booleanField() },
	})
})

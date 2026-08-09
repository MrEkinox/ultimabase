import { expectTypeOf, test } from 'vitest'

import { Schema, type FieldBuilder } from '../index.js'
import type { WhereBuilder, WhereInput } from '../../query/index.js'
import { createAccessWhere } from './filter.js'

const Author = Schema.define({
	className: 'TypedAccessWhereAuthor',
	fields: (field) => ({ active: field.boolean(), name: field.string() }),
})
const Tag = Schema.define({
	className: 'TypedAccessWhereTag',
	fields: (field) => ({ label: field.string(), visible: field.boolean() }),
})
const Article = Schema.define({
	className: 'TypedAccessWhereArticle',
	fields: (field) => ({
		aliases: field.string({ list: true }),
		author: field.pointer({ target: () => Author }),
		metadata: field.object({ fields: (field) => ({ label: field.string() }) }),
		published: field.boolean(),
		score: field.int(),
		status: field.enum({ values: ['draft', 'published'] }),
		tags: field.relation({ target: () => Tag }),
		title: field.string(),
		views: field.int(),
	}),
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
	const fields = (field: FieldBuilder) => ({
		published: field.boolean(),
		views: field.int(),
	})

	const ContextualSchema = Schema.define({
		className: 'ContextualAccessWhereArticle',
		fields,
		access: {
			read: {
				where: {
					published: { eq: true },
					views: { gte: 10 },
				},
			},
			update: {
				where: ({ where }) => where.eq('published', true),
			},
		},
	})

	const invalidWhere: WhereInput<typeof ContextualSchema> = {
		// @ts-expect-error -- Public where objects retain exact field names.
		missing: { eq: true },
	}

	void ContextualSchema
	void invalidWhere
})

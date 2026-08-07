import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	booleanField,
	intField,
	jsonField,
	objectField,
	relationField,
	stringField,
} from '../../schema/index.js'
import { fieldPath } from './factory.js'
import { WhereBuilder, type WhereInput } from './where.js'

const Tag = Schema.define({
	className: 'WhereTag',
	fields: {
		archived: booleanField(),
		label: stringField(),
	},
})

const Post = Schema.define({
	className: 'WherePost',
	fields: {
		metadata: jsonField(),
		profile: objectField({
			fields: {
				contact: objectField({
					fields: { email: stringField() },
				}),
			},
		}),
		published: booleanField(),
		tags: relationField({ target: () => Tag }),
		title: stringField(),
		views: intField(),
	},
})

test('correlates where object operators with exact schema fields', () => {
	const input = {
		published: { eq: false },
		views: { between: { lower: 10, upper: 100 }, gte: 0 },
		title: { contains: 'typed', startsWith: 'T' },
		profile: {
			at: [
				{
					path: ['contact', 'email'],
					eq: 'ada@example.com',
				},
			],
		},
		metadata: {
			at: [{ path: ['category'], in: ['framework', 'typescript'] }],
		},
		tags: {
			some: { label: { eq: 'typescript' } },
			none: { archived: { eq: true } },
		},
		OR: [{ views: { gt: 1_000 } }, { published: { eq: true } }],
		NOT: { title: { startsWith: 'Archive' } },
	} as const satisfies WhereInput<typeof Post>

	expectTypeOf(input.published.eq).toEqualTypeOf<false>()

	// @ts-expect-error -- Unknown fields cannot enter the schema-correlated contract.
	const unknownField: WhereInput<typeof Post> = { missing: { eq: true } }
	// @ts-expect-error -- Boolean fields do not expose ordered comparison operators.
	const invalidBoolean: WhereInput<typeof Post> = { published: { gte: true } }
	// @ts-expect-error -- Numeric operands retain the exact field value type.
	const invalidNumber: WhereInput<typeof Post> = { views: { eq: '10' } }
	const invalidRelationNull: WhereInput<typeof Post> = {
		// @ts-expect-error -- Relation emptiness uses some or none rather than nullability.
		tags: { isNull: true },
	}
	const invalidPath: WhereInput<typeof Post> = {
		profile: {
			at: [
				{
					// @ts-expect-error -- Typed object paths reject undeclared segments.
					path: ['missing'],
					eq: 'value',
				},
			],
		},
	}

	void unknownField
	void invalidBoolean
	void invalidNumber
	void invalidRelationNull
	void invalidPath
})

test('keeps the public builder short, immutable, and schema-correlated', () => {
	const base = new WhereBuilder(Post).eq('published', false)
	const extended = base
		.gte('views', 0)
		.between('views', 10, 100)
		.eq(fieldPath('profile', ['contact', 'email']), 'ada@example.com')
		.some('tags', (tag) => tag.eq('label', 'typescript'))

	expectTypeOf(base).toEqualTypeOf<WhereBuilder<typeof Post>>()
	expectTypeOf(extended.build()).toEqualTypeOf<WhereInput<typeof Post>>()

	expectTypeOf(base).not.toHaveProperty('equalTo')
	// @ts-expect-error -- String operators are not available for booleans.
	base.contains('published', 'false')
	// @ts-expect-error -- A builder from another schema cannot be combined.
	base.and(new WhereBuilder(Tag).eq('label', 'typescript'))
	// @ts-expect-error -- Relation emptiness uses some or none rather than nullability.
	base.isNull('tags')
})

import { test } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'

const declare = () =>
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
	})

test('types the portable where of a partial index in the final .with (ADR-0303)', () => {
	declare().with({
		indexes: [
			{ fields: ['slug'] },
			{ fields: ['slug', 'rank'], unique: true, where: { archived: false } },
			{
				fields: ['rank'],
				where: {
					rank: { gt: 0, lte: 10 },
					slug: null,
					AND: [{ archived: { isNull: true } }, { createdAt: { gte: '2026' } }],
				},
			},
		],
	})
	// @ts-expect-error -- disjunction is not portable.
	declare().with({ indexes: [{ fields: ['slug'], where: { OR: [] } }] })
	// @ts-expect-error -- `ne` is not portable.
	declare().with({
		indexes: [{ fields: ['slug'], where: { slug: { ne: 'a' } } }],
	})
	declare().with({
		// @ts-expect-error -- string operators are not portable.
		indexes: [{ fields: ['slug'], where: { slug: { startsWith: 'a' } } }],
	})
	// @ts-expect-error -- booleans have no order.
	declare().with({
		indexes: [{ fields: ['slug'], where: { archived: { gt: true } } }],
	})
	// @ts-expect-error -- list fields cannot appear in a partial-index predicate.
	declare().with({ indexes: [{ fields: ['slug'], where: { labels: null } }] })
	// @ts-expect-error -- JSON fields cannot appear in a partial-index predicate.
	declare().with({ indexes: [{ fields: ['slug'], where: { metadata: null } }] })
	// @ts-expect-error -- values keep the field type.
	declare().with({ indexes: [{ fields: ['slug'], where: { rank: 'one' } }] })
	// @ts-expect-error -- index fields must exist.
	declare().with({ indexes: [{ fields: ['missing'] }] })
})

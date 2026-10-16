import { test } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('types the portable where of a partial index in define (ADR-0303, ADR-0339)', () => {
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
		}),
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
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex0',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- disjunction is not portable.
		indexes: [{ fields: ['slug'], where: { OR: [] } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex1',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- `ne` is not portable.
		indexes: [{ fields: ['slug'], where: { slug: { ne: 'a' } } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex2',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- string operators are not portable.
		indexes: [{ fields: ['slug'], where: { slug: { startsWith: 'a' } } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex3',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- booleans have no order.
		indexes: [{ fields: ['slug'], where: { archived: { gt: true } } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex4',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- list fields cannot appear in a partial-index predicate.
		indexes: [{ fields: ['slug'], where: { labels: null } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex5',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- JSON fields cannot appear in a partial-index predicate.
		indexes: [{ fields: ['slug'], where: { metadata: null } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex6',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- values keep the field type.
		indexes: [{ fields: ['slug'], where: { rank: 'one' } }],
	})
	UltimaBase.Schema.define({
		className: 'TypedPartialIndex7',
		fields: (field) => ({
			slug: field.string(),
			archived: field.boolean(),
			rank: field.int(),
			labels: field.string({ list: true }),
			metadata: field.json(),
		}),
		// @ts-expect-error -- index fields must exist.
		indexes: [{ fields: ['missing'] }],
	})
})

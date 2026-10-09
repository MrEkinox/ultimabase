import { describe, expect, it } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'

describe('partial indexes (ADR-0303)', () => {
	it('normalizes the portable where into one conjunction of conditions', () => {
		const Post = UltimaBase.Schema.define({
			className: 'PartialIndexPost',
			fields: (field) => ({
				slug: field.string(),
				archived: field.boolean(),
				rank: field.int(),
				owner: field.uuid(),
			}),
		}).with({
			indexes: [
				{
					fields: ['slug'],
					unique: true,
					where: {
						archived: false,
						rank: { gte: 1, lt: 10 },
						AND: [{ owner: null }, { slug: { isNotNull: true } }],
					},
				},
			],
		})

		expect(Post.definition.indexes).toStrictEqual([
			{
				fields: ['slug'],
				unique: true,
				where: [
					{ kind: 'equal', field: 'archived', value: false },
					{ kind: 'greater-than-or-equal', field: 'rank', value: 1 },
					{ kind: 'less-than', field: 'rank', value: 10 },
					{ kind: 'null', field: 'owner', isNull: true },
					{ kind: 'null', field: 'slug', isNull: false },
				],
			},
		])
	})

	it.each([
		[
			{ OR: [{ archived: false }] },
			'where.OR is not portable in a partial index',
		],
		[
			{ NOT: { archived: false } },
			'where.NOT is not portable in a partial index',
		],
		[
			{ slug: { ne: 'x' } },
			'where.slug.ne is not a portable partial-index operator',
		],
		[
			{ slug: { in: ['x'] } },
			'where.slug.in is not a portable partial-index operator',
		],
		[
			{ slug: { startsWith: 'x' } },
			'where.slug.startsWith is not a portable partial-index operator',
		],
		[
			{ slug: { eq: { nested: true } } },
			'where.slug.eq must be a literal value',
		],
		[{ labels: { eq: 'x' } }, 'where.labels must be a scalar non-list field'],
		[
			{ metadata: null },
			'where.metadata cannot be tested for null in a partial index',
		],
		[
			{ archived: { gt: true } },
			'where.archived does not support ordered comparisons',
		],
		[{ rank: 'one' }, 'where.rank must compare a int value'],
		[{ missing: true }, 'Unknown index field: missing'],
		[{}, 'where must not be empty'],
	])('rejects the non-portable where %j', (where, message) => {
		// Old-form `define` indexes are checked eagerly, without typed fields.
		expect(() =>
			UltimaBase.Schema.define({
				className: 'NonPortablePartialIndex',
				fields: (field) => ({
					slug: field.string(),
					archived: field.boolean(),
					rank: field.int(),
					labels: field.string({ list: true }),
					metadata: field.json(),
				}),
				indexes: [{ fields: ['slug'], where: where as never }],
			}),
		).toThrow(
			new TypeError(
				message.startsWith('Unknown') ? message : `indexes[0].${message}`,
			),
		)
	})

	it('checks fields named only by the final .with when the application compiles', async () => {
		const Draft = UltimaBase.Schema.define({
			className: 'PendingIndexField',
			fields: (field) => ({ slug: field.string() }),
		}).with({
			// @ts-expect-error -- `isPublished` is neither declared nor contributed.
			indexes: [{ fields: ['slug'], where: { isPublished: true } }],
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			schemas: [Draft],
		})

		await expect(ultimabase.initialize()).rejects.toThrow(
			'Unknown index field: isPublished',
		)
		await ultimabase.dispose()
	})
})

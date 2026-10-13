import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { readPublishedPage } from '../src/newsroom.ts'
import { Article, StaffMember } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Schema commands and canonical `where` objects compile to parameterized
// SQL; application code never writes SQL or Drizzle.

const createAuthor = () =>
	StaffMember.createOne({ data: { name: 'Ada', email: 'ada@example.com' } })

it('creates, reads, updates and deletes one row', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()

	//#region crud
	const created = await Article.createOne({
		data: {
			slug: 'crud',
			title: 'Runtime to PostgreSQL',
			author: { connect: ada.id },
		},
		select: { title: true },
	})

	const found = await Article.findOne({
		where: { id: { eq: created.id } },
		select: { title: true, status: true },
	})

	const updated = await Article.updateOne({
		where: { id: created.id },
		data: { title: 'Updated' },
		select: { title: true },
	})

	const deleted = await Article.deleteOne({
		where: { id: created.id },
		select: { title: true },
	})
	//#endregion crud

	expect(created).toStrictEqual({
		id: created.id,
		title: 'Runtime to PostgreSQL',
	})
	expect(found).toStrictEqual({
		id: created.id,
		status: 'draft',
		title: 'Runtime to PostgreSQL',
	})
	expect(updated).toStrictEqual({ id: created.id, title: 'Updated' })
	expect(deleted).toStrictEqual({ id: created.id, title: 'Updated' })
	expect(await Article.count()).toBe(0)
})

it('writes many rows and upserts on a unique field', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()

	//#region bulk
	const imported = await Article.createMany({
		data: [
			{ slug: 'one', title: 'One', author: { connect: ada.id } },
			{ slug: 'two', title: 'Two', author: { connect: ada.id } },
		],
		select: { slug: true },
	})

	// `slug` is unique: the upsert updates the row it identifies, or creates it.
	const upsert = () =>
		Article.upsertOne({
			where: { slug: { eq: 'runtime-postgres' } },
			create: {
				slug: 'runtime-postgres',
				title: 'Draft',
				author: { connect: ada.id },
			},
			update: { title: 'Runtime + PostgreSQL' },
			select: { title: true },
		})
	const created = await upsert()
	const updated = await upsert()
	//#endregion bulk

	// Results keep the input order.
	expect(imported.map(({ slug }) => slug)).toStrictEqual(['one', 'two'])
	expect(created).toMatchObject({ title: 'Draft' })
	expect(updated).toStrictEqual({
		id: created.id,
		title: 'Runtime + PostgreSQL',
	})
})

it('compiles filters to parameterized predicates', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await Article.createMany({
		data: [
			{
				slug: 'release-12',
				title: 'Ultima_100% ready',
				keywords: ['postgres'],
				metadata: { visibility: 'public', featured: true },
				author: { connect: ada.id },
			},
			{
				slug: 'release-notes',
				title: 'Ultima 1000 ready',
				keywords: ['typescript'],
				metadata: { visibility: 'private' },
				author: { connect: ada.id },
			},
		],
	})

	//#region filters
	// `%` and `_` are literal characters here, not SQL wildcards.
	const literal = await Article.findMany({
		where: { title: { contains: 'Ultima_100%' } },
		select: { slug: true },
	})

	const matching = await Article.findMany({
		where: {
			slug: {
				matches: { source: '^release-[0-9]+$', flags: ['case-insensitive'] },
			},
			keywords: { has: 'postgres' },
			metadata: { contains: { visibility: 'public' } },
		},
		select: { slug: true },
	})
	//#endregion filters

	expect(literal.map(({ slug }) => slug)).toStrictEqual(['release-12'])
	expect(matching.map(({ slug }) => slug)).toStrictEqual(['release-12'])
	expect(
		await Article.count({
			where: { metadata: { hasAnyKeys: ['featured', 'pinned'] } },
		}),
	).toBe(1)
})

it('reads pages after a position, without OFFSET', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()
	await Article.createMany({
		data: ['a', 'b', 'c', 'd', 'e'].map((slug, day) => ({
			slug,
			title: `Article ${slug}`,
			status: 'published' as const,
			publishedAt: `2026-10-0${String(day + 1)}T08:00:00.000Z`,
			author: { connect: ada.id },
		})),
	})

	//#region read-pages
	const first = await readPublishedPage()
	const second = await readPublishedPage(first.rows.at(-1))
	const third = await readPublishedPage(second.rows.at(-1))
	//#endregion read-pages

	expect(
		[first, second, third].map((page) => [
			page.hasMore,
			page.rows.map(({ title }) => title),
		]),
	).toStrictEqual([
		[true, ['Article e', 'Article d']],
		[true, ['Article c', 'Article b']],
		[false, ['Article a']],
	])

	//#region skip
	// Offset pagination: simpler, but it shifts when rows are inserted.
	const skipped = await Article.findMany({
		orderBy: { publishedAt: 'desc' },
		select: { title: true },
		skip: 2,
		take: 2,
	})
	//#endregion skip

	expect(skipped.map(({ title }) => title)).toStrictEqual([
		'Article c',
		'Article b',
	])
})

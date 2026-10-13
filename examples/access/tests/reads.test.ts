import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Article, Subscriber } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Each `//#region` below is shown on the Access documentation page; the
// assertions after it prove what the page says about the result.

const denied = { code: 'PERMISSION_DENIED' }

it('reads published articles only and hides the internal note', async () => {
	await using t = await testApplication(ultimabase)
	// Master bypasses Access: trusted server code writes the articles.
	const launch = await t.asMaster(() =>
		Article.createOne({
			data: { internalNote: 'Embargo', published: true, title: 'Launch' },
		}),
	)
	await t.asMaster(() =>
		Article.createOne({ data: { internalNote: 'Draft', title: 'Roadmap' } }),
	)

	//#region read-articles
	const articles = await Article.findMany({ orderBy: { title: 'asc' } })
	//#endregion read-articles

	// The private row filter keeps the published article; `internalNote`
	// is omitted from the ordinary result.
	expect(articles).toMatchObject([{ published: true, title: 'Launch' }])
	expect(Object.keys(articles[0] ?? {}).sort()).toStrictEqual([
		'createdAt',
		'id',
		'published',
		'title',
		'updatedAt',
	])
	expect(await Article.count()).toBe(1)
	// Naming the field in a selection, a filter or a sort is refused.
	await expect(
		Article.findMany({ select: { internalNote: true } }),
	).rejects.toMatchObject(denied)
	await expect(
		Article.findMany({ where: { internalNote: { eq: 'Draft' } } }),
	).rejects.toMatchObject(denied)
	await expect(
		Article.findMany({ orderBy: { internalNote: 'asc' } }),
	).rejects.toMatchObject(denied)
	// Mutations have no rule, so ordinary callers cannot write.
	await expect(
		Article.createOne({ data: { title: 'Leak' } }),
	).rejects.toMatchObject(denied)
	await expect(
		Article.updateOne({
			data: { published: true },
			where: { id: launch.id },
		}),
	).rejects.toMatchObject(denied)
	expect(await t.asMaster(() => Article.count())).toBe(2)
})

it('counts subscribers without listing them', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(() =>
		Subscriber.createMany({
			data: [{ email: 'ada@example.com' }, { email: 'grace@example.com' }],
		}),
	)

	expect(await Subscriber.count()).toBe(2)
	// `one`, `many` and `exists` have no rule: they stay denied.
	await expect(Subscriber.findMany()).rejects.toMatchObject(denied)
	await expect(Subscriber.findOne({ where: {} })).rejects.toMatchObject(denied)
	await expect(Subscriber.exists({ where: {} })).rejects.toMatchObject(denied)
})

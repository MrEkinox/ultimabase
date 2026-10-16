import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { outbox } from '../src/effects.ts'
import { Author, Post, Tag } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

// Each `//#region` below is shown on the Hooks documentation page; the
// assertions after it prove what the page says about the result.

it('resolves the data of a create, field Hooks first', async () => {
	await using t = await testApplication(ultimabase)
	//#region create
	const post = await Post.createOne({
		data: { title: '  Hello Hooks ', summary: null },
	})
	//#endregion create

	// The field Hook trimmed the title, then the schema Hook derived the slug.
	expect(post).toMatchObject({
		slug: 'hello-hooks',
		summary: null,
		title: 'Hello Hooks',
	})
	// A field Hook never runs for null: `value.trim()` would have thrown.
	const trimmed = await Post.createOne({
		data: { title: 'Second', summary: '  Short ' },
	})
	expect(trimmed.summary).toBe('Short')
	await t.afterCommit()
})

it('gives an update only its changes, in readable form', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await Author.createOne({ data: { name: 'Ada' } })
	const [red, green, blue] = await Tag.createMany({
		data: [{ label: 'red' }, { label: 'green' }, { label: 'blue' }],
	})
	if (red === undefined || green === undefined || blue === undefined) {
		throw new TypeError('Expected three tags')
	}
	const post = await Post.createOne({
		data: { title: 'Draft', tags: { connect: [red.id, green.id] } },
	})
	await t.afterCommit()
	outbox.length = 0

	//#region update-changes
	await Post.updateOne({
		where: { id: { eq: post.id } },
		data: {
			views: { increment: 1 },
			author: { connect: ada.id },
			tags: { set: [green.id, blue.id] },
		},
	})
	//#endregion update-changes

	await t.afterCommit()
	const webhook = outbox.find(({ to }) => to === 'webhook')
	// The atomic operation stays an operation, the pointer is the new Pointer,
	// and the `set` is its difference with the current tags.
	expect(webhook?.body).toMatchObject({
		author: { id: ada.id },
		tags: { connect: [blue.id], disconnect: [red.id] },
		views: { increment: 1 },
	})
	// Only what changed, with Core's generated `updatedAt`.
	expect(Object.keys(webhook?.body ?? {}).sort()).toStrictEqual([
		'author',
		'tags',
		'updatedAt',
		'views',
	])
})

it('renames the slug with the title', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'First title' } })

	const renamed = await Post.updateOne({
		where: { id: { eq: post.id } },
		data: { title: 'Second title' },
	})

	expect(renamed).toMatchObject({ slug: 'second-title' })
	await t.afterCommit()
})

it('knows whether an upsert creates or updates', async () => {
	await using t = await testApplication(ultimabase)
	//#region upsert
	const importPost = () =>
		Post.upsertOne({
			where: { slug: { eq: 'imported-post' } },
			create: { title: 'Imported post' },
			update: { views: { increment: 1 } },
		})

	const created = await importPost()
	const updated = await importPost()
	//#endregion upsert

	expect(created).toMatchObject({ slug: 'imported-post', views: 0 })
	expect(updated).toMatchObject({ id: created.id, views: 1 })
	expect(await Post.count()).toBe(1)
	await t.afterCommit()
})

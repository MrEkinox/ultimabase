import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import {
	readPostCard,
	readPostsWithoutNotes,
	readPublishedPosts,
	readRecentPublishedPosts,
} from '../src/reads.ts'
import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createPosts, missingId } from './support.ts'

// Each `//#region` below is shown on the Reading Data pages; the assertions
// after it prove what the page says about the result.

it('reads published posts newest first with only the selected fields', async () => {
	await testApplication(ultimabase)
	await createPosts([
		{ title: 'First', published: true },
		{ title: 'Draft' },
		{ title: 'Second', published: true },
	])

	const posts = await readPublishedPosts()

	expect(posts.map(({ title }) => title)).toStrictEqual(['Second', 'First'])
	expect(Object.keys(posts[0] ?? {}).sort()).toStrictEqual([
		'createdAt',
		'id',
		'title',
	])
	expect(Object.isFrozen(posts[0])).toBe(true)
	expect(await readRecentPublishedPosts()).toHaveLength(2)
})

it('chooses a read terminal by what absence means', async () => {
	await testApplication(ultimabase)
	await createPosts([{ title: 'Hello', published: true }])

	//#region terminals
	const many = await Post.findMany({ where: { published: false } })
	const one = await Post.findOne({ where: { title: 'Missing' } })
	const total = await Post.count({ where: { published: true } })
	const any = await Post.exists({ where: { title: 'Hello' } })
	const required = Post.findOneOrThrow({ where: { title: 'Missing' } })
	//#endregion terminals

	expect(many).toStrictEqual([])
	expect(one).toBeNull()
	expect(total).toBe(1)
	expect(any).toBe(true)
	await expect(required).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('selects by inclusion or by exclusion', async () => {
	await testApplication(ultimabase)
	const [post] = await createPosts([{ title: 'Card', published: true }])
	await Post.updateOne({
		where: { id: post?.id ?? missingId },
		data: { internalNote: 'Private' },
	})

	const card = await readPostCard(post?.id ?? missingId)
	const withoutNotes = await readPostsWithoutNotes()

	expect(Object.keys(card).sort()).toStrictEqual(['createdAt', 'id', 'title'])
	expect(withoutNotes[0]).not.toHaveProperty('internalNote')
	expect(withoutNotes[0]).toMatchObject({ title: 'Card', published: true })
	await expect(readPostCard(missingId)).rejects.toMatchObject({
		code: 'NOT_FOUND',
	})
})

import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { countCommentWords, readPostPage } from '../src/reads.ts'
import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createComments, createPosts } from './support.ts'

it('reads every page once with take and after', async () => {
	await testApplication(ultimabase)
	await createPosts(
		Array.from({ length: 30 }, (_, index) => ({
			title: `Post ${String(index)}`,
		})),
	)

	const first = await readPostPage()
	const second = await readPostPage(first.rows.at(-1))

	expect(first.rows).toHaveLength(25)
	expect(first.hasMore).toBe(true)
	expect(second.rows).toHaveLength(5)
	expect(second.hasMore).toBe(false)
	// The pages are the single read without `take`, in the same order.
	const all = await Post.findMany({
		orderBy: { createdAt: 'desc' },
		select: { id: true, createdAt: true, title: true },
	})
	expect([...first.rows, ...second.rows]).toStrictEqual(all)
})

it('continues after a row read with the same shape', async () => {
	await testApplication(ultimabase)
	await createPosts([{ title: 'A' }, { title: 'B' }, { title: 'C' }])

	const page = await Post.findMany({
		orderBy: { title: 'desc' },
		select: { id: true, title: true },
		take: 2,
	})
	// `after` is the last row received; there is none after an empty page.
	const last = page.at(-1)
	const next = await Post.findMany({
		orderBy: { title: 'desc' },
		select: { id: true, title: true },
		take: 2,
		...(last === undefined ? {} : { after: last }),
	})

	expect(page.map(({ title }) => title)).toStrictEqual(['C', 'B'])
	expect(next.map(({ title }) => title)).toStrictEqual(['A'])
	// The position must carry every ordered field and `id`.
	await expect(async () =>
		Post.findMany({
			orderBy: { title: 'desc' },
			take: 2,
			after: { id: last?.id ?? '' },
		}),
	).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicDetails: { parameter: 'after' },
	})
	await expect(async () =>
		Post.findMany({ take: 2, skip: 1, after: { id: last?.id ?? '' } }),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
})

it('sorts null last in both directions', async () => {
	await testApplication(ultimabase)
	const [, second] = await createPosts([{ title: 'A' }, { title: 'B' }])
	await Post.updateOne({
		where: { id: second?.id ?? '' },
		data: { summary: 'Has a summary' },
	})

	const ascending = await Post.findMany({ orderBy: { summary: 'asc' } })
	const descending = await Post.findMany({ orderBy: { summary: 'desc' } })

	expect(ascending.map(({ title }) => title)).toStrictEqual(['B', 'A'])
	expect(descending.map(({ title }) => title)).toStrictEqual(['B', 'A'])
})

it('reads a whole table in batches', async () => {
	await testApplication(ultimabase)
	await createComments(
		Array.from(
			{ length: 501 },
			(_, index) => `Comment number ${String(index)}`,
		),
	)

	expect(await countCommentWords()).toBe(1503)
})

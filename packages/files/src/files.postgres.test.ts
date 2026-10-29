// Files on PostgreSQL (D-152): concurrent writes of one row keep each
// other's files, one file goes to one row only, and a row's files live and
// go with it.
import { afterEach, expect, it } from 'vitest'
import { files } from './index.ts'
import { FilesBlob } from './model.ts'
import { alice, M, png, Post, started, text } from './test/app.ts'
import { database, urls } from './test/postgres.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function start(url: string) {
	const running = await started({}, database(url))
	stop = async () => running.app.stop()
	return running
}

const attachment = (name: string) =>
	files.upload(text, { for: 'Post.attachments', name, as: alice })

const states = async () =>
	(await FilesBlob.findMany({ orderBy: { name: 'asc' } }, M)).map(
		({ name, state }) => `${name} ${state}`,
	)

for (const url of urls) {
	const host = new URL(url).host

	it(`keeps both files of two concurrent pushes on ${host}`, async () => {
		await start(url)
		const post = await Post.create(
			{ data: { title: 'a', attachments: [] } },
			{ as: alice },
		)
		const [a, b] = await Promise.all([attachment('a'), attachment('b')])
		await Promise.all(
			[a, b].map(({ id }) =>
				Post.update(
					{ where: { id: post.id }, data: { attachments: { push: id } } },
					{ as: alice },
				),
			),
		)
		const read = await Post.findUnique({ where: { id: post.id } }, M)
		const ids = read?.attachments.map(({ id }) => id).toSorted()
		expect(ids).toStrictEqual([a.id, b.id].toSorted())
		expect(await states()).toStrictEqual(['a attached', 'b attached'])
	})

	it(`attaches one file to one of two concurrent rows on ${host}`, async () => {
		await start(url)
		const { id } = await attachment('a')
		const results = await Promise.allSettled(
			['one', 'two'].map((title) =>
				Post.create({ data: { title, attachments: [id] } }, { as: alice }),
			),
		)
		expect(results.map(({ status }) => status).toSorted()).toStrictEqual([
			'fulfilled',
			'rejected',
		])
		const posts = await Post.findMany({}, M)
		expect(posts.flatMap(({ attachments }) => attachments)).toHaveLength(1)
	})

	it(`stores a row's files, then deletes them with it on ${host}`, async () => {
		const { storage } = await start(url)
		const { id } = await files.upload(png, {
			for: 'Post.cover',
			name: 'a.png',
			as: alice,
		})
		const post = await Post.create(
			{ data: { title: 'a', cover: id, attachments: [] } },
			{ as: alice },
		)
		const read = await Post.findUnique({ where: { id: post.id } }, M)
		expect(read?.cover).toMatchObject({
			id,
			name: 'a.png',
			type: 'image/png',
			inline: { first: png[0], named: 'a.png' },
			variants: { thumb: { type: 'image/webp', size: 16 } },
		})
		expect(storage.objects.size).toBe(2)
		await Post.delete({ where: { id: post.id } }, M)
		expect(storage.objects.size).toBe(0)
		expect(await states()).toStrictEqual([])
	})
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { allow } from 'ultimabase'
import { files } from './index.ts'
import { sweep } from './lifecycle.ts'
import { FilesBlob } from './model.ts'
import { alice, bob, M, pdf, png, Post, started, text } from './test/app.ts'
import { upload } from './upload.ts'

type Started = Awaited<ReturnType<typeof started>>
let running: Started | undefined

async function start(...args: Parameters<typeof started>): Promise<Started> {
	running = await started(...args)
	return running
}

afterEach(async () => {
	await running?.app.stop()
	running = undefined
})

const blobs = () => FilesBlob.findMany({ orderBy: { name: 'asc' } }, M)
const cover = (name = 'a.png') =>
	files.upload(png, { for: 'Post.cover', name, as: alice })
const attachment = (name: string, as = alice) =>
	files.upload(text, { for: 'Post.attachments', name, as })

describe('an upload', () => {
	it('stores the file and its variants, pending, with its inline values', async () => {
		const { storage } = await start()
		const { id } = await cover()
		const rows = await blobs()
		expect(
			rows.map(({ name, state, uploadedBy }) => [name, state, uploadedBy]),
		).toStrictEqual([
			['a.png', 'pending', 'alice'],
			['thumb', 'pending', 'alice'],
		])
		expect(rows[0]).toMatchObject({
			id,
			type: 'image/png',
			size: png.length,
			inline: { first: 0x89, named: 'a.png' },
		})
		expect(rows[1]).toMatchObject({
			variantOf: id,
			type: 'image/webp',
			size: 16,
		})
		expect(
			[...storage.objects.keys()].every((key) => key.startsWith('public/')),
		).toBe(true)
		// A variant whose bytes are not its type's is served as a download.
		expect(storage.objects.get(rows[1]?.key ?? '')?.attachment).toBe(true)
		expect(storage.objects.get(rows[0]?.key ?? '')?.attachment).toBe(false)
	})

	it('takes a Blob, its type declared', async () => {
		const { storage } = await start()
		const body = new Blob([text], { type: 'text/csv; charset=utf-8' })
		const { id } = await files.upload(body, {
			for: 'Post.doc',
			name: 'a.csv',
			as: alice,
		})
		const [row] = await blobs()
		expect(row).toMatchObject({ id, type: 'text/csv', size: text.length })
		expect(row?.key.startsWith('private/')).toBe(true)
		expect(storage.objects.get(row?.key ?? '')?.attachment).toBe(true)
	})

	it('streams a body without inline values or variants, its first bytes read once', async () => {
		const { storage } = await start()
		const bytes = new Uint8Array(10_000)
		bytes.set(pdf)
		let sent = 0
		const body = new ReadableStream<Uint8Array>({
			pull: (controller) => {
				if (sent === bytes.length) return controller.close()
				controller.enqueue(bytes.slice(sent, sent + 1000))
				sent += 1000
			},
		})
		await upload(body, bytes.length, {
			for: 'Post.doc',
			name: 'a.pdf',
			as: alice,
		})
		const [object] = [...storage.objects.values()]
		expect(object?.type).toBe('application/pdf')
		expect(object?.body).toStrictEqual(bytes)
	})

	it('stores a short streamed body whole', async () => {
		const { storage } = await start()
		await upload(new Blob([pdf]).stream(), pdf.length, {
			for: 'Post.doc',
			name: 'a.pdf',
			as: alice,
		})
		expect([...storage.objects.values()][0]?.body).toStrictEqual(pdf)
	})

	it('refuses a caller access.upload refuses', async () => {
		await start()
		await expect(
			files.upload(png, { for: 'Post.cover', name: 'a.png' }),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(await blobs()).toStrictEqual([])
	})

	it('lets Master upload, and anyone with allow.public', async () => {
		await start({ access: { upload: allow.public } })
		await files.upload(png, { for: 'Post.cover', name: 'm.png', as: M.as })
		await files.upload(png, { for: 'Post.cover', name: 'p.png' })
		const rows = await blobs()
		expect(
			rows
				.filter(({ variantOf }) => variantOf === null)
				.map(({ uploadedBy }) => uploadedBy),
		).toStrictEqual(['master', null])
	})

	it('refuses an unknown field, an empty name, a large file and a wrong size', async () => {
		await start()
		await expect(
			files.upload(png, { for: 'Post.title', name: 'a', as: alice }),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await expect(
			files.upload(png, { for: 'Nope', name: 'a', as: alice }),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await expect(
			files.upload(png, { for: 'Post.cover', name: '', as: alice }),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		await expect(
			files.upload(new Uint8Array(2000), {
				for: 'Post.attachments',
				name: 'big',
				as: alice,
			}),
		).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
		await expect(
			upload(png, png.length + 1, {
				for: 'Post.cover',
				name: 'a.png',
				as: alice,
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
		expect(await blobs()).toStrictEqual([])
	})

	it('takes a detected type accept matches, or an undetected one accept lists', async () => {
		await start()
		const refused = { code: 'UNSUPPORTED_MEDIA_TYPE' }
		await expect(
			files.upload(pdf, { for: 'Post.cover', name: 'a.pdf', as: alice }),
		).rejects.toMatchObject(refused)
		await expect(
			files.upload(text, { for: 'Post.cover', name: 'a.txt', as: alice }),
		).rejects.toMatchObject(refused)
		const plain = new Blob([text], { type: 'text/plain' })
		await expect(
			files.upload(plain, { for: 'Post.doc', name: 'a.txt', as: alice }),
		).rejects.toMatchObject(refused)
		await files.upload(pdf, { for: 'Post.doc', name: 'a.pdf', as: alice })
		await files.upload(text, {
			for: 'Post.attachments',
			name: 'a.bin',
			as: alice,
		})
		const types = (await blobs()).map(({ type }) => type)
		expect(types).toStrictEqual(['application/octet-stream', 'application/pdf'])
	})

	it('deletes its objects and its rows when a variant fails', async () => {
		const { storage } = await start()
		await expect(
			files.upload(png, { for: 'Failing.image', name: 'a.png', as: alice }),
		).rejects.toThrow('No thumbnail.')
		expect(storage.objects.size).toBe(0)
		expect(await blobs()).toStrictEqual([])
	})

	it('refuses an inline value that is not JSON of 2 KB, or not its schema', async () => {
		await start()
		await expect(
			files.upload(png, { for: 'Failing.large', name: 'a.png', as: alice }),
		).rejects.toThrow('The inline big is not JSON of 2 KB at most.')
		await expect(
			files.upload(png, { for: 'Failing.typed', name: 'a.png', as: alice }),
		).rejects.toThrow('The inline count does not match its schema.')
		expect(await blobs()).toStrictEqual([])
	})
})

describe('a write', () => {
	it('attaches the uploaded file, which reads with its URLs', async () => {
		await start()
		const { id } = await cover()
		const post = await Post.create(
			{ data: { title: 'a', cover: id } },
			{ as: alice },
		)
		expect(post.cover).toMatchObject({
			id,
			name: 'a.png',
			type: 'image/png',
			size: png.length,
			inline: { first: 0x89, named: 'a.png' },
			variants: { thumb: { type: 'image/webp', size: 16 } },
		})
		expect(post.cover?.url).toMatch(/^memory:\/\/files\/public\//)
		const rows = await blobs()
		expect(
			rows.map(({ state, attachedTo, deleteAfter }) => [
				state,
				attachedTo,
				deleteAfter,
			]),
		).toStrictEqual([
			['attached', `Post.cover:${post.id}`, null],
			['attached', `Post.cover:${post.id}`, null],
		])
		const [read] = await Post.findMany({}, M)
		expect(read?.cover).toStrictEqual(post.cover)
		expect(read?.attachments).toStrictEqual([])
	})

	it('refuses another caller’s upload, another field’s and an unknown id', async () => {
		await start()
		const { id } = await cover()
		const { id: doc } = await files.upload(pdf, {
			for: 'Post.doc',
			name: 'a.pdf',
			as: alice,
		})
		const invalid = { code: 'VALIDATION_FAILED' }
		await expect(
			Post.create({ data: { title: 'a', cover: id } }, { as: bob }),
		).rejects.toMatchObject(invalid)
		await expect(
			Post.create({ data: { title: 'a', cover: doc } }, { as: alice }),
		).rejects.toMatchObject(invalid)
		await expect(
			Post.create({ data: { title: 'a', cover: 'nope' } }, { as: alice }),
		).rejects.toMatchObject(invalid)
		const thumb = (await blobs()).find(({ name }) => name === 'thumb')
		await expect(
			Post.create({ data: { title: 'a', cover: thumb?.id ?? '' } }, M),
		).rejects.toMatchObject(invalid)
		// Master attaches any.
		await Post.create({ data: { title: 'a', cover: id } }, M)
	})

	it('lets anyone attach a public upload', async () => {
		await start({ access: { upload: allow.public } })
		const { id } = await files.upload(png, { for: 'Post.cover', name: 'a.png' })
		const post = await Post.create(
			{ data: { title: 'a', cover: id } },
			{ as: bob },
		)
		expect(post.cover?.id).toBe(id)
	})

	it('refuses a file attached elsewhere', async () => {
		await start()
		const { id } = await cover()
		await Post.create({ data: { title: 'a', cover: id } }, { as: alice })
		await expect(
			Post.create({ data: { title: 'b', cover: id } }, { as: alice }),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
	})

	it('refuses an expired file', async () => {
		await start()
		const { id } = await cover()
		await FilesBlob.updateMany(
			{ where: {}, data: { deleteAfter: new Date(Date.now() - 1) } },
			M,
		)
		await expect(
			Post.create({ data: { title: 'a', cover: id } }, { as: alice }),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
	})

	it('refuses what is not an id', async () => {
		await start()
		const invalid = { code: 'VALIDATION_FAILED' }
		const number = { title: 'a', cover: 3 }
		const operations = {
			title: 'a',
			attachments: { push: ['a'], remove: ['b'] },
		}
		// @ts-expect-error -- a file field is written as an id.
		await expect(Post.create({ data: number }, M)).rejects.toMatchObject(
			invalid,
		)
		await expect(
			// @ts-expect-error -- a list is written as ids, or one operation.
			Post.create({ data: operations }, M),
		).rejects.toMatchObject(invalid)
	})

	it('deletes the replaced file after the commit, and keeps the kept one', async () => {
		const { storage } = await start()
		const { id: first } = await cover('first.png')
		const post = await Post.create(
			{ data: { title: 'a', cover: first } },
			{ as: alice },
		)
		const { id: second } = await cover('second.png')
		await Post.update(
			{ where: { id: post.id }, data: { cover: second } },
			{ as: alice },
		)
		const rows = await blobs()
		expect(rows.map(({ name }) => name)).toStrictEqual(['second.png', 'thumb'])
		expect(storage.objects.size).toBe(2)
		await Post.update(
			{ where: { id: post.id }, data: { title: 'b' } },
			{ as: alice },
		)
		expect(await blobs()).toHaveLength(2)
		await Post.update(
			{ where: { id: post.id }, data: { cover: null } },
			{ as: alice },
		)
		expect(await blobs()).toStrictEqual([])
		expect(storage.objects.size).toBe(0)
	})

	it('deletes a deleted row’s files after the commit', async () => {
		const { storage } = await start()
		const { id } = await cover()
		const { id: a } = await attachment('a.csv')
		const post = await Post.create(
			{ data: { title: 'a', cover: id, attachments: [a] } },
			{ as: alice },
		)
		await Post.delete({ where: { id: post.id } }, { as: alice })
		expect(await blobs()).toStrictEqual([])
		expect(storage.objects.size).toBe(0)
	})

	it('keeps the files when the write rolls back', async () => {
		const { storage } = await start()
		const { id } = await cover()
		await expect(
			Post.create(
				{ data: { title: 'a', cover: id, attachments: ['nope'] } },
				{ as: alice },
			),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		expect((await blobs()).map(({ state }) => state)).toStrictEqual([
			'pending',
			'pending',
		])
		expect(storage.objects.size).toBe(2)
	})
})

const ids = (post: {
	readonly attachments: readonly { readonly id: string }[]
}) => post.attachments.map(({ id }) => id)

describe('a list', () => {
	it('takes a new list, push, pushUnique and remove, each file once', async () => {
		const { storage } = await start()
		const [a, b, c] = await Promise.all(
			['a', 'b', 'c'].map((name) => attachment(name)),
		)
		const post = await Post.create(
			{ data: { title: 'a', attachments: [a?.id ?? ''] } },
			{ as: alice },
		)
		const where = { id: post.id }
		const pushed = await Post.update(
			{ where, data: { attachments: { push: [b?.id ?? ''] } } },
			{ as: alice },
		)
		expect(ids(pushed)).toStrictEqual([a?.id, b?.id])
		await expect(
			Post.update(
				{ where, data: { attachments: { push: [a?.id ?? ''] } } },
				{ as: alice },
			),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const unique = await Post.update(
			{
				where,
				data: {
					attachments: { pushUnique: [a?.id ?? '', c?.id ?? '', c?.id ?? ''] },
				},
			},
			{ as: alice },
		)
		expect(ids(unique)).toStrictEqual([a?.id, b?.id, c?.id])
		const removed = await Post.update(
			{ where, data: { attachments: { remove: [b?.id ?? ''] } } },
			{ as: alice },
		)
		expect(ids(removed)).toStrictEqual([a?.id, c?.id])
		expect(storage.objects.size).toBe(2)
		const set = await Post.update(
			{ where, data: { attachments: { set: [c?.id ?? ''] } } },
			{ as: alice },
		)
		expect(ids(set)).toStrictEqual([c?.id])
		const reordered = await Post.update(
			{ where, data: { attachments: [c?.id ?? ''] } },
			{ as: alice },
		)
		expect(ids(reordered)).toStrictEqual([c?.id])
		expect((await blobs()).map(({ name }) => name)).toStrictEqual(['c'])
		expect(storage.objects.size).toBe(1)
	})
})

describe('the sweep', () => {
	it('deletes the expired pending files, and the released ones a crash left', async () => {
		const { storage } = await start()
		await cover()
		const { id } = await attachment('kept')
		await FilesBlob.updateMany(
			{
				where: { name: { in: ['a.png', 'thumb'] } },
				data: { deleteAfter: new Date(Date.now() - 1) },
			},
			M,
		)
		await sweep()
		expect((await blobs()).map(({ id: kept }) => kept)).toStrictEqual([id])
		expect(storage.objects.size).toBe(1)
	})

	it('runs every ten minutes', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
		try {
			const { storage } = await start()
			await cover()
			const past = new Date(Date.now() - 1)
			await FilesBlob.updateMany({ where: {}, data: { deleteAfter: past } }, M)
			await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
			await vi.waitFor(() => expect(storage.objects.size).toBe(0))
			expect(await blobs()).toStrictEqual([])
		} finally {
			vi.useRealTimers()
		}
	})

	it('keeps the rows whose objects it could not delete, and says so', async () => {
		const { storage, warnings } = await start()
		await cover()
		await FilesBlob.updateMany(
			{ where: {}, data: { deleteAfter: new Date(Date.now() - 1) } },
			M,
		)
		const down = vi.spyOn(storage, 'delete')
		down.mockRejectedValue(new Error('Down.'))
		await sweep()
		down.mockRestore()
		expect(await blobs()).toHaveLength(2)
		expect(warnings).toHaveLength(1)
	})
})

describe('files.check', () => {
	it('reports the objects without a row, and the rows without an object', async () => {
		const { storage } = await start()
		const { id } = await attachment('a')
		await storage.put('private/stray', text, {
			type: 'text/plain',
			size: text.length,
			attachment: true,
		})
		const [row] = await blobs()
		await storage.delete(row?.key ?? '')
		expect(await files.check()).toStrictEqual({
			objects: ['private/stray'],
			rows: [row?.key],
		})
		expect(storage.objects.has('private/stray')).toBe(true)
		await files.check({ delete: true })
		expect(storage.objects.size).toBe(0)
		expect(row?.id).toBe(id)
	})

	it('needs the plugin started', async () => {
		await expect(files.check()).rejects.toThrow('filesPlugin has not started.')
	})
})

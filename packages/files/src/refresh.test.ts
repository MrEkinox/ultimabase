// `files.refresh` (D-366): the inline values and variants a field gained
// after its files were stored, made from their bodies, written on their
// blobs and in their rows' copies without the application's hooks, which a
// live list sees; a broken file, or a row written meanwhile, fails alone.
import { httpPlugin } from '@ultimabase/http'
import type { LiveMessage, Realtime, RealtimeApi } from '@ultimabase/realtime'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { allow, defineApp, defineModel, definePlugin, memory } from 'ultimabase'
import { storedFields } from 'ultimabase/internal'
import type { FileStorage, Inline, MemoryFiles, Variant } from './index.ts'
import { file, files, filesPlugin, memoryFiles } from './index.ts'
import { blobCopy } from './lifecycle.ts'
import { FilesBlob } from './model.ts'
import { alice, logging, M, png } from './test/app.ts'
import { storedJson } from './values.ts'

// The field's options are these objects, not copies: a key added to one
// after an upload is a key the field gained after its files were stored.
const inline: { [key: string]: Inline } = {}
const variants: { [key: string]: Variant } = {}
const hooked: string[] = []

const Album = defineModel({
	name: 'Album',
	fields: (f) => ({
		title: f.string(),
		cover: file({ optional: true, accept: ['image/*'], inline, variants }),
		photos: file({ list: true, inline, variants }),
	}),
	use: [realtime()],
}).with({
	access: { read: allow.public },
	hooks: {
		afterUpdate: () => {
			hooked.push('afterUpdate')
		},
	},
})

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let live: RealtimeApi | undefined
/** Keeps the realtime API, as a transport does. */
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		live = plugins.realtime
	},
})

/** What a test changes of the storage: its answers and its writes. */
let answer: Response | undefined
let fetched = false
let failPut = false

/**
 * memoryFiles(), its puts failing when a test says, and its bodies served
 * as `answer` says, or read at a `data:` URL when it serves none.
 */
function storageOf(stored: MemoryFiles): FileStorage {
	const dataUrl = (key: string): string => {
		const body = Buffer.from(stored.objects.get(key)?.body ?? [])
		return `data:application/octet-stream;base64,${body.toString('base64')}`
	}
	const storage: FileStorage = {
		start: (server) => {
			stored.start(server)
		},
		put: async (key, body, options) => {
			if (failPut) throw new Error('The storage is full.')
			await stored.put(key, body, options)
		},
		delete: async (key) => stored.delete(key),
		keys: async () => stored.keys(),
		url: (key) => (fetched ? dataUrl(key) : stored.url(key)),
	}
	if (fetched) return storage
	return {
		...storage,
		serve: async (key, url) =>
			answer ?? (await stored.serve?.(key, url)) ?? Response.error(),
	}
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	for (const key of Object.keys(inline)) Reflect.deleteProperty(inline, key)
	for (const key of Object.keys(variants)) {
		Reflect.deleteProperty(variants, key)
	}
	hooked.length = 0
	answer = undefined
	fetched = false
	failPut = false
})

async function started() {
	const storage = memoryFiles()
	const warnings: unknown[] = []
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			filesPlugin({ storage: storageOf(storage) }),
			realtimePlugin(),
			watching.plugin(),
		],
		models: [Album],
		logger: logging(warnings),
	})
	await app.start()
	stop = async () => app.stop()
	return { storage, warnings }
}

const changed = 'The file changed during the refresh; refresh it again.'

const uploaded = async (name = 'a.png'): Promise<string> =>
	(await files.upload(png, { for: 'Album.cover', name, ...M })).id

const albumWith = async (cover: string) =>
	Album.create({ data: { title: 'a', cover } }, M)

const read = async (id: string) =>
	Album.findUnique({ where: { id } }, M).then((album) => album?.cover)

/** Keys the field gains: an inline size and a small variant. */
function gained(): { readonly calls: string[] } {
	const calls: string[] = []
	inline['size'] = ({ body }) => {
		calls.push('size')
		return body.length
	}
	variants['small'] = ({ body }) => ({
		body: body.slice(0, 8),
		type: 'image/webp',
	})
	return { calls }
}

describe('files.refresh', () => {
	it('fills the keys a field gained, in the blob and the row, once', async () => {
		const { storage } = await started()
		const calls: string[] = []
		inline['first'] = ({ body }) => {
			calls.push('first')
			return body[0] ?? 0
		}
		const album = await albumWith(await uploaded())
		gained()
		expect((await read(album.id))?.inline['size']).toBeNull()
		expect((await read(album.id))?.variants['small']).toBeNull()

		const result = await files.refresh('Album.cover', M)

		expect(result).toStrictEqual({ refreshed: 1, failed: [] })
		// A key the file holds is not made again.
		expect(calls).toStrictEqual(['first'])
		const cover = await read(album.id)
		expect(cover?.inline).toStrictEqual({ first: 0x89, size: png.length })
		expect(cover?.variants['small']?.type).toBe('image/webp')
		const main = await FilesBlob.findFirst({ where: { variantOf: null } }, M)
		const small = await FilesBlob.findFirst(
			{ where: { variantOf: { not: null } } },
			M,
		)
		expect(small).toMatchObject({
			variantOf: main?.id,
			name: 'small',
			state: 'attached',
			attachedTo: `Album.cover:${album.id}`,
			size: 8,
		})
		expect(storage.objects.get(small?.key ?? '')?.body).toStrictEqual(
			png.slice(0, 8),
		)
		// The row's copy is the one attaching the file writes.
		const row = (await storedFields('Album', 'cover', [album.id])).get(album.id)
		if (main === null || small === null) throw new Error('No blob.')
		expect(row?.value).toStrictEqual(storedJson(blobCopy(main, [small])))

		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [],
		})
	})

	it('writes the row without its hooks and keeps its updatedAt', async () => {
		await started()
		const album = await albumWith(await uploaded())
		gained()
		await files.refresh('Album.cover', M)
		const after = await Album.findUnique({ where: { id: album.id } }, M)
		expect(after?.cover?.inline['size']).toBe(png.length)
		expect(after?.updatedAt).toStrictEqual(album.updatedAt)
		expect(hooked).toStrictEqual([])
	})

	it('is seen by a live list', async () => {
		await started()
		const album = await albumWith(await uploaded())
		gained()
		if (live === undefined) throw new Error('No realtime API.')
		const viewer = await live.connect(new Request('http://localhost/'))
		const seen: LiveMessage[] = []
		await viewer.list('Album', { first: 10 }, (message) => seen.push(message))
		await vi.waitFor(() => expect(seen).toHaveLength(1))

		await files.refresh('Album.cover', M)

		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({
			kind: 'changes',
			changes: [
				{
					upsert: {
						id: album.id,
						cover: { inline: { size: png.length } },
					},
				},
			],
		})
	})

	it('fills each copy of a list, in one write', async () => {
		await started()
		const ids = [
			(await files.upload(png, { for: 'Album.photos', name: 'a.png', ...M }))
				.id,
			(await files.upload(png, { for: 'Album.photos', name: 'b.png', ...M }))
				.id,
		]
		const album = await Album.create({ data: { title: 'a', photos: ids } }, M)
		gained()
		expect(await files.refresh('Album.photos', M)).toStrictEqual({
			refreshed: 2,
			failed: [],
		})
		const after = await Album.findUnique({ where: { id: album.id } }, M)
		expect(
			after?.photos.map(({ id, inline: values }) => [id, values]),
		).toStrictEqual(ids.map((id) => [id, { size: png.length }]))
		expect(after?.updatedAt).toStrictEqual(album.updatedAt)
	})

	it('fills a pending file’s blob, its variants pending with it', async () => {
		await started()
		const id = await uploaded()
		gained()
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 1,
			failed: [],
		})
		const main = await FilesBlob.findUnique({ where: { id } }, M)
		const small = await FilesBlob.findFirst({ where: { variantOf: id } }, M)
		expect(main).toMatchObject({ id, inline: { size: png.length } })
		expect(small).toMatchObject({
			variantOf: id,
			state: 'pending',
			attachedTo: null,
			deleteAfter: main?.deleteAfter,
		})
	})

	it('fails a file whose body is gone, and refreshes the others', async () => {
		const { storage, warnings } = await started()
		const gone = await uploaded('gone.png')
		const kept = await uploaded('kept.png')
		const blob = await FilesBlob.findUnique({ where: { id: gone } }, M)
		await storage.delete(blob?.key ?? '')
		gained()
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 1,
			failed: [{ id: gone, error: 'The file is not in the storage.' }],
		})
		const done = await FilesBlob.findUnique({ where: { id: kept } }, M)
		expect(done?.inline).toStrictEqual({ size: png.length })
		expect(warnings).toContainEqual({ field: 'Album.cover', failed: 1 })
	})

	it('fails a file the storage does not serve', async () => {
		await started()
		const id = await uploaded()
		inline['size'] = ({ body }) => body.length
		answer = new Response(null, { status: 500 })
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [{ id, error: 'The storage answered 500.' }],
		})
	})

	it('reads a body at its URL from a storage that serves none', async () => {
		fetched = true
		await started()
		const id = await uploaded()
		inline['size'] = ({ body }) => body.length
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 1,
			failed: [],
		})
		const blob = await FilesBlob.findUnique({ where: { id } }, M)
		expect(blob?.inline).toStrictEqual({ size: png.length })
	})

	it('leaves no variant of a file it failed to store', async () => {
		const { storage } = await started()
		const id = await uploaded()
		const objects = storage.objects.size
		gained()
		failPut = true
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [{ id, error: 'The storage is full.' }],
		})
		const where = { variantOf: id }
		expect(await FilesBlob.findMany({ where }, M)).toStrictEqual([])
		expect(storage.objects.size).toBe(objects)
		const blob = await FilesBlob.findUnique({ where: { id } }, M)
		expect(blob?.inline).toStrictEqual({})
	})

	it('fails a file whose row was written meanwhile, until refreshed again', async () => {
		await started()
		const album = await albumWith(await uploaded())
		const id = album.cover?.id ?? ''
		let writing = true
		inline['size'] = async ({ body }) => {
			if (writing) {
				writing = false
				const data = { title: 'b' }
				await Album.update({ where: { id: album.id }, data }, M)
			}
			return body.length
		}
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [
				{ id, error: 'The row changed during the refresh; refresh it again.' },
			],
		})
		expect((await read(album.id))?.inline['size']).toBeNull()
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 1,
			failed: [],
		})
		const after = await Album.findUnique({ where: { id: album.id } }, M)
		expect(after).toMatchObject({
			title: 'b',
			cover: { inline: { size: png.length } },
		})
	})

	it('fails the files of a row that holds no file', async () => {
		await started()
		const album = await albumWith(await uploaded())
		const id = album.cover?.id ?? ''
		const row = (await storedFields('Album', 'cover', [album.id])).get(album.id)
		await row?.write({ id })
		gained()
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [
				{ id, error: 'A file field: the row holds a file that is not one.' },
			],
		})
	})

	it('deletes the variants of a file replaced meanwhile', async () => {
		const { storage } = await started()
		const album = await albumWith(await uploaded())
		const id = album.cover?.id ?? ''
		const other = await uploaded('b.png')
		let replacing = true
		variants['small'] = async ({ body }) => {
			if (replacing) {
				replacing = false
				const data = { cover: other }
				await Album.update({ where: { id: album.id }, data }, M)
			}
			return { body: body.slice(0, 8), type: 'image/webp' }
		}
		const { failed } = await files.refresh('Album.cover', M)
		expect(failed).toContainEqual({
			id,
			error: changed,
		})
		await vi.waitFor(async () => {
			const where = { variantOf: id }
			expect(await FilesBlob.findMany({ where }, M)).toStrictEqual([])
		})
		// No object is left without its row, nor a row without its object.
		expect(await files.check()).toStrictEqual({ objects: [], rows: [] })
		expect(storage.objects.size).toBeGreaterThan(0)
	})

	it('deletes the variants of a file released meanwhile, before its purge', async () => {
		const { storage } = await started()
		const id = await uploaded()
		const objects = storage.objects.size
		variants['small'] = async ({ body }) => {
			// Released, its objects not deleted yet: as a purge that failed.
			const data = { state: 'released' }
			await FilesBlob.updateMany({ where: { id }, data }, M)
			return { body: body.slice(0, 8), type: 'image/webp' }
		}
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [{ id, error: changed }],
		})
		const where = { variantOf: id }
		expect(await FilesBlob.findMany({ where }, M)).toStrictEqual([])
		expect(storage.objects.size).toBe(objects)
	})

	it('attaches the variants of a file attached meanwhile', async () => {
		await started()
		const id = await uploaded()
		let album = ''
		variants['small'] = async ({ body }) => {
			album = (await albumWith(id)).id
			return { body: body.slice(0, 8), type: 'image/webp' }
		}
		expect(await files.refresh('Album.cover', M)).toStrictEqual({
			refreshed: 0,
			failed: [{ id, error: changed }],
		})
		const small = await FilesBlob.findFirst({ where: { variantOf: id } }, M)
		expect(small).toMatchObject({
			state: 'attached',
			attachedTo: `Album.cover:${album}`,
			deleteAfter: null,
		})
	})

	it('only runs for Master, on a file field', async () => {
		const { warnings } = await started()
		await expect(
			files.refresh('Album.cover', { as: alice }),
		).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
			message: 'Only Master refreshes files.',
		})
		await expect(files.refresh('Album.cover')).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(warnings).toContainEqual({ callerId: 'alice' })
		expect(warnings).toContainEqual({ callerId: null })
		await expect(files.refresh('Album.title', M)).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
		})
	})
})

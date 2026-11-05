// The browser client for uploads (D-250): a file and a list of files sent
// to a running server, its refusals as `FileError`, a request that reaches
// no server, and an aborted upload.
import { readFile } from 'node:fs/promises'
import { allow } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileError, uploader } from './client.ts'
import { M, masterKey, pdf, png, Post, started } from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	vi.restoreAllMocks()
	await stop?.()
	stop = undefined
})

async function start(options: Parameters<typeof started>[0] = {}) {
	const running = await started(options)
	stop = async () => running.app.stop()
	return running.url
}

const master = { 'x-ultimabase-master-key': masterKey }
const image = (name: string) => new File([png], name, { type: 'image/png' })

/** The failure of `upload`, which must reject. */
async function failure(upload: Promise<unknown>): Promise<unknown> {
	try {
		await upload
	} catch (error) {
		return error
	}
	throw new Error('The upload resolved.')
}

describe('uploader', () => {
	it('sends a file for its field, and resolves to its id', async () => {
		const url = await start()
		const files = uploader({ url: `${url}/`, headers: master })
		const id = await files.upload(image('a.png'), { for: 'Post.cover' })
		const created = await Post.create(
			{ data: { title: 'a', cover: id, attachments: [] } },
			M,
		)
		expect(created.cover).toMatchObject({
			id,
			name: 'a.png',
			type: 'image/png',
		})
	})

	it('sends a list of files, and resolves to their ids in order', async () => {
		const url = await start({ access: { upload: allow.public } })
		const files = uploader({ url })
		const named = ['a.csv', 'b.csv', 'c.csv'].map(
			(name) => new File(['a,b\n'], name, { type: 'text/csv' }),
		)
		const ids = await files.upload(new Set(named), { for: 'Post.attachments' })
		const created = await Post.create(
			{ data: { title: 'a', attachments: ids } },
			M,
		)
		expect(created.attachments.map((each) => each.name)).toStrictEqual([
			'a.csv',
			'b.csv',
			'c.csv',
		])
		await expect(files.upload([], { for: 'Post.cover' })).resolves.toEqual([])
	})

	it('reads its headers at each upload', async () => {
		const url = await start()
		const headers = vi.fn<() => Promise<typeof master>>(async () => master)
		const files = uploader({ url, headers })
		await files.upload([image('a.png'), image('b.png')], { for: 'Post.cover' })
		expect(headers).toHaveBeenCalledTimes(2)
	})
})

describe('a refused upload', () => {
	it("rejects with the server's code, message and details", async () => {
		const url = await start()
		const refused = uploader({ url })
		const files = uploader({ url, headers: master })
		const denied = await failure(
			refused.upload(image('a.png'), { for: 'Post.cover' }),
		)
		expect(denied).toBeInstanceOf(FileError)
		expect(denied).toMatchObject({ name: 'FileError', code: 'ACCESS_DENIED' })
		const typed = new File([pdf], 'a.pdf', { type: 'application/pdf' })
		await expect(
			files.upload(typed, { for: 'Post.cover' }),
		).rejects.toMatchObject({
			code: 'UNSUPPORTED_MEDIA_TYPE',
			message: 'application/pdf is not accepted.',
		})
		const large = new File([new Uint8Array(2048)], 'a.bin')
		await expect(
			files.upload(large, { for: 'Post.attachments' }),
		).rejects.toMatchObject({
			code: 'PAYLOAD_TOO_LARGE',
			message: 'The file is over 1024 bytes.',
		})
		const unnamed = await failure(files.upload(image('a.png'), { for: '' }))
		expect(unnamed).toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{ path: ['for'], message: 'Expected a file field: Model.field.' },
				],
			},
		})
	})

	it('rejects a list on its first failure, and aborts the others', async () => {
		const url = await start({ access: { upload: allow.public } })
		const files = uploader({ url })
		const sent = vi.spyOn(globalThis, 'fetch')
		const list = [image('a.png'), new File([pdf], 'b.pdf'), image('c.png')]
		await expect(files.upload(list, { for: 'Post.cover' })).rejects.toThrow(
			FileError,
		)
		const signals = sent.mock.calls.map(([, init]) => init?.signal?.aborted)
		expect(signals).toStrictEqual([true, true, true])
	})

	it('reads a body that is no error as INTERNAL', async () => {
		const files = uploader({ url: 'http://localhost' })
		const answers = [
			new Response('Bad gateway', { status: 502 }),
			Response.json({ code: 1 }, { status: 400 }),
			Response.json({}, { status: 201 }),
		]
		for (const answer of answers) {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer)
			const error = await failure(files.upload(image('a.png'), { for: 'a' }))
			expect(error).toBeInstanceOf(FileError)
			expect(error).toMatchObject({
				code: 'INTERNAL',
				message: 'The upload failed.',
			})
			expect(error).not.toHaveProperty('details')
		}
	})
})

describe('an upload that does not reach the server', () => {
	it('rejects with NETWORK', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
			new TypeError('fetch failed'),
		)
		const files = uploader({ url: 'http://localhost' })
		await expect(
			files.upload(image('a.png'), { for: 'Post.cover' }),
		).rejects.toMatchObject({
			code: 'NETWORK',
			message: 'The upload did not reach the server.',
		})
	})

	it("rejects an aborted upload with the signal's reason", async () => {
		const url = await start({ access: { upload: allow.public } })
		const files = uploader({ url })
		const reason = new Error('Cancelled.')
		const before = AbortSignal.abort(reason)
		await expect(
			files.upload(image('a.png'), { for: 'Post.cover', signal: before }),
		).rejects.toBe(reason)
		const controller = new AbortController()
		const list = files.upload([image('a.png'), image('b.png')], {
			for: 'Post.cover',
			signal: controller.signal,
		})
		controller.abort(reason)
		await expect(list).rejects.toBe(reason)
	})
})

describe('the client', () => {
	it('imports nothing, so a browser bundle takes none of the server', async () => {
		const source = await readFile(new URL('client.ts', import.meta.url), 'utf8')
		expect(source).not.toMatch(/^\s*(import|export .* from)\b/mu)
	})
})

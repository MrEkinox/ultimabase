// `POST /files` (D-152, D-153): the raw body stored for its field, limited
// by the field's `maxSize` and not by the HTTP plugin's 1 MB.
import { allow } from 'ultimabase'
import { afterEach, expect, it } from 'vitest'
import { M, masterKey, pdf, png, Post, started } from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function start(options: Parameters<typeof started>[0] = {}) {
	const running = await started(options)
	stop = async () => running.app.stop()
	return running.url
}

const master = { 'x-ultimabase-master-key': masterKey }

async function post(url: string, query: string, init: RequestInit) {
	const response = await fetch(`${url}/files?${query}`, {
		method: 'POST',
		...init,
	})
	return { status: response.status, json: await response.json() }
}

it('stores the body for its field, and answers its id', async () => {
	const url = await start()
	const { status, json } = await post(url, 'for=Post.cover&name=a.png', {
		body: png,
		headers: master,
	})
	expect(status).toBe(201)
	const id: unknown = Reflect.get(Object(json), 'id')
	const created = await Post.create(
		{ data: { title: 'a', cover: String(id), attachments: [] } },
		M,
	)
	expect(created.cover).toMatchObject({ id, name: 'a.png', type: 'image/png' })
})

it("takes a body over the HTTP plugin's limit, under the field's", async () => {
	const url = await start({ access: { upload: allow.public } })
	const large = new Uint8Array(1_500_000).fill(32)
	large.set(pdf)
	const { status } = await post(url, 'for=Post.doc&name=a.pdf', {
		body: large,
	})
	expect(status).toBe(201)
})

it("refuses a body over the field's maxSize", async () => {
	const url = await start({ access: { upload: allow.public } })
	const response = await post(url, 'for=Post.attachments&name=a', {
		body: new Uint8Array(2048),
	})
	expect(response).toStrictEqual({
		status: 413,
		json: {
			code: 'PAYLOAD_TOO_LARGE',
			message: 'The file is over 1024 bytes.',
		},
	})
})

it('refuses a body without Content-Length', async () => {
	const url = await start({ access: { upload: allow.public } })
	const body = new Blob([png]).stream()
	const response = await post(url, 'for=Post.cover&name=a.png', {
		body,
		duplex: 'half',
	})
	expect(response).toStrictEqual({
		status: 411,
		json: { code: 'LENGTH_REQUIRED', message: 'Content-Length is required.' },
	})
})

it('refuses a type the field does not accept', async () => {
	const url = await start({ access: { upload: allow.public } })
	const response = await post(url, 'for=Post.cover&name=a.pdf', { body: pdf })
	expect(response).toStrictEqual({
		status: 415,
		json: {
			code: 'UNSUPPORTED_MEDIA_TYPE',
			message: 'application/pdf is not accepted.',
		},
	})
})

it('refuses a caller access.upload refuses, and a missing field', async () => {
	const url = await start()
	const refused = await post(url, 'for=Post.cover&name=a.png', { body: png })
	expect(refused).toMatchObject({
		status: 403,
		json: { code: 'ACCESS_DENIED' },
	})
	const unnamed = await post(url, 'name=a.png', { body: png, headers: master })
	expect(unnamed).toMatchObject({
		status: 400,
		json: {
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{ path: ['for'], message: 'Expected a file field: Model.field.' },
				],
			},
		},
	})
})

it('reads an empty body as an empty file', async () => {
	const url = await start({ access: { upload: allow.public } })
	const { status } = await post(url, 'for=Post.attachments&name=a', {
		body: '',
		headers: { 'content-type': 'text/plain' },
	})
	expect(status).toBe(201)
})

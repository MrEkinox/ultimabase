// `s3()` against SeaweedFS from `compose.yaml` (D-152), which checks every
// signature: a public file read by its stable URL, a private one by its
// presigned URL only, a streamed body, and no object left behind.
import { afterEach, beforeAll, expect, it } from 'vitest'
import { files, s3 } from './index.ts'
import { presign } from './sigv4.ts'
import { alice, M, png, Post, started, text } from './test/app.ts'

const endpoint = 'http://localhost:58333'
const signer = {
	region: 'us-east-1',
	accessKeyId: 'test',
	secretAccessKey: 'test-secret',
}
const storage = () => s3({ ...signer, bucket: 'media', endpoint })

beforeAll(async () => {
	const url = presign(signer, {
		method: 'PUT',
		url: new URL(`${endpoint}/media`),
		expires: 60,
		headers: {},
	})
	const { status } = await fetch(url, { method: 'PUT' })
	// Created, or there from an earlier run.
	if (status !== 200 && status !== 409) {
		throw new Error(`SeaweedFS refused the bucket: ${status}.`)
	}
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function start(): Promise<void> {
	const { app } = await started({ storage: storage() })
	stop = async () => app.stop()
	// What an earlier run that failed left.
	await files.check({ delete: true })
}

async function read(url: string) {
	const response = await fetch(url)
	const body = new Uint8Array(await response.arrayBuffer())
	return {
		status: response.status,
		type: response.headers.get('content-type'),
		disposition: response.headers.get('content-disposition'),
		body,
	}
}

it('serves a public file and its variant by their stable URLs', async () => {
	await start()
	const { id } = await files.upload(png, {
		for: 'Post.cover',
		name: 'a.png',
		as: alice,
	})
	const post = await Post.create(
		{ data: { title: 'a', cover: id, attachments: [] } },
		{ as: alice },
	)
	const url = post.cover?.url ?? ''
	expect(new URL(url).search).toBe('')
	expect(await read(url)).toStrictEqual({
		status: 200,
		type: 'image/png',
		disposition: null,
		body: png,
	})
	const thumb = await read(post.cover?.variants.thumb?.url ?? '')
	expect(thumb).toMatchObject({ status: 200, type: 'image/webp' })
	expect(thumb.body).toStrictEqual(png.slice(0, 16))
	await Post.delete({ where: { id: post.id } }, M)
	expect((await read(url)).status).toBe(404)
	expect(await files.check()).toStrictEqual({ objects: [], rows: [] })
})

it('serves a private file by its presigned URL only, as a download', async () => {
	await start()
	const blob = new Blob([text], { type: 'text/csv' })
	const { id } = await files.upload(blob, {
		for: 'Post.doc',
		name: 'a.csv',
		as: alice,
	})
	const post = await Post.create(
		{ data: { title: 'a', doc: id, attachments: [] } },
		{ as: alice },
	)
	const url = new URL(post.doc?.url ?? '')
	expect(await read(url.href)).toStrictEqual({
		status: 200,
		type: 'text/csv',
		disposition: 'attachment',
		body: text,
	})
	expect((await read(`${url.origin}${url.pathname}`)).status).toBe(403)
	await Post.delete({ where: { id: post.id } }, M)
})

const upload = (body: Uint8Array) =>
	files.upload(new Blob([body]), {
		for: 'Post.doc',
		name: 'a.pdf',
		as: alice,
	})

it('streams a large body, and deletes the file a write replaced', async () => {
	await start()
	const large = new Uint8Array(200_000).fill(32)
	large.set(new TextEncoder().encode('%PDF-1.4\n'))
	const first = await upload(large)
	const post = await Post.create(
		{ data: { title: 'a', doc: first.id, attachments: [] } },
		{ as: alice },
	)
	const url = post.doc?.url ?? ''
	const stored = await read(url)
	expect(stored).toMatchObject({ status: 200, type: 'application/pdf' })
	expect(stored.body).toStrictEqual(large)
	const second = await upload(large)
	await Post.update(
		{ where: { id: post.id }, data: { doc: second.id } },
		{ as: alice },
	)
	expect((await read(url)).status).toBe(404)
	await Post.delete({ where: { id: post.id } }, M)
	expect(await files.check()).toStrictEqual({ objects: [], rows: [] })
})

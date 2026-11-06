// Uploads files as a browser would, with `uploader()`, then writes their
// ids in posts over GraphQL, each test on a new in-memory database. The
// GraphQL requests are the files of requests/, shown on the page (D-282).
import { files } from '@ultimabase/files'
import { FileError, uploader } from '@ultimabase/files/client'
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { Post } from './models.ts'

const running = testApplication(app)
const requests = requestFiles(new URL('requests/', import.meta.url), running)

/** The value under `path` in a response body. */
const at = (value: unknown, ...path: string[]): unknown =>
	path.reduce<unknown>((inner, key) => Reflect.get(Object(inner), key), value)

/** A 1×1 PNG. */
const png = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	),
	(char) => char.charCodeAt(0),
)

/** A text file's id, uploaded for `Post.attachments`. */
async function attachment(name: string, text: string): Promise<string> {
	const upload = new File([text], name, { type: 'text/plain' })
	return uploader({ url: running.url }).upload(upload, {
		for: 'Post.attachments',
	})
}

it('uploads a cover, then writes its id in a post', async () => {
	//#region upload
	const client = uploader({ url: running.url })
	const cover = new File([png], 'cover.png', { type: 'image/png' })
	const id = await client.upload(cover, { for: 'Post.cover' })
	//#endregion
	const created = await requests.check(
		'create-post',
		{ cover: id },
		{ status: 200 },
	)
	expect(at(created, 'data', 'createPost', 'cover', 'id')).toBe(id)
})

it('reads a public file by its URL', async () => {
	const cover = new File([png], 'cover.png', { type: 'image/png' })
	const id = await uploader({ url: running.url }).upload(cover, {
		for: 'Post.cover',
	})
	await requests.check('create-post', { cover: id })
	const body = await requests.file('read-cover')
	expect(body).toMatchObject({
		data: { posts: { edges: [{ node: { cover: { name: 'cover.png' } } }] } },
	})
	const url = String(
		at(body, 'data', 'posts', 'edges', '0', 'node', 'cover', 'url'),
	)
	expect(url).toMatch(/^http:\/\/localhost:\d+\/files\/public\//)
	// The application serves the files of memoryFiles(), as a bucket would.
	const image = await fetch(url)
	expect(image.headers.get('content-type')).toBe('image/png')
})

it("types a file's id as an ID, as every id", async () => {
	const body = await requests.send(
		`{ __type(name: "PostCover") { fields { name type { ofType { name } } } } }`,
	)
	expect(at(body, 'data', '__type', 'fields')).toContainEqual({
		name: 'id',
		type: { ofType: { name: 'ID' } },
	})
	const cover = new File([png], 'cover.png', { type: 'image/png' })
	const id = await uploader({ url: running.url }).upload(cover, {
		for: 'Post.cover',
	})
	const created = await requests.check('create-post', { cover: id })
	expect(at(created, 'data', 'createPost', 'cover', 'id')).toBe(id)
	expect(id).toMatch(/^[0-9a-f-]{36}$/)
})

it('pushes to a list of files, and removes from it', async () => {
	const notes = await attachment('notes.txt', 'Bring the slides.')
	const prices = await attachment('prices.txt', 'Tea: 3, coffee: 4.')
	const created = await requests.check('create-attachment', { ids: [notes] })
	const id = at(created, 'data', 'createPost', 'id')
	const attachments = { push: [prices] }
	await requests.check('push-attachment', { id, attachments })
	const removed = await requests.check('remove-attachment', {
		id,
		attachments: { remove: [notes] },
	})
	expect(at(removed, 'data', 'updatePost', 'attachments')).toHaveLength(1)
})

it('refuses a type accept does not list', async () => {
	//#region refused
	const client = uploader({ url: running.url })
	const text = new File(['Not a picture.'], 'cover.txt', {
		type: 'text/plain',
	})
	const refused: unknown = await client
		.upload(text, { for: 'Post.cover' })
		.catch((error: unknown) => error)
	expect(refused).toBeInstanceOf(FileError)
	expect(refused).toMatchObject({
		code: 'UNSUPPORTED_MEDIA_TYPE',
		message: 'text/plain is not accepted.',
	})
	//#endregion
})

it('refuses a large file', async () => {
	//#region large
	const large = new File(['x'.repeat(100_001)], 'big.txt', {
		type: 'text/plain',
	})
	await expect(
		uploader({ url: running.url }).upload(large, { for: 'Post.attachments' }),
	).rejects.toMatchObject({
		code: 'PAYLOAD_TOO_LARGE',
		message: 'The file is over 100000 bytes.',
	})
	//#endregion
})

it("refuses another field's id", async () => {
	// An attachment's id, written as a cover.
	const notes = await attachment('notes.txt', 'Bring the slides.')
	//#region foreign
	const body = await requests.file('foreign-id', { id: notes })
	const message = `${notes} is not a file uploaded for Post.cover.`
	expect(body).toMatchObject({
		errors: [
			{
				extensions: {
					code: 'VALIDATION_FAILED',
					details: { issues: [{ path: ['cover'], message }] },
				},
			},
		],
	})
	//#endregion
})

it('uploads and checks the files from server code', async () => {
	//#region server
	const as = { as: master }
	const { id } = await files.upload(png, { for: 'Post.cover', name: 'a.png' })
	const post = await Post.create({ data: { title: 'Hi', cover: id } }, as)
	expect(post.cover?.inline.size).toEqual({ width: 1, height: 1 })
	// The earlier tests' objects outlive their database, which each test
	// resets: they have no row, and `delete: true` deletes them.
	const { rows } = await files.check({ delete: true })
	expect(rows).toEqual([])
	// Now the storage and the database agree.
	expect(await files.check()).toEqual({ objects: [], rows: [] })
	//#endregion
})

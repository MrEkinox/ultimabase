// Uploads files as a client would, with `POST /files`, then writes their
// ids in posts over GraphQL, each test on a new in-memory database.
import { files } from '@ultimabase/files'
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Post } from './models.ts'

const running = testApplication(app)

/** A GraphQL request's response body. */
async function request(
	query: string,
	variables: object = {},
): Promise<unknown> {
	const response = await fetch(`${running.url}/graphql`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	})
	return response.json()
}

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

//#region upload-function
/** Uploads a file for a field, as a browser would; the response's body. */
async function upload(field: string, file: File) {
	const query = new URLSearchParams({ for: field, name: file.name })
	const response = await fetch(`${running.url}/files?${query.toString()}`, {
		method: 'POST',
		// fetch sends the Content-Length and the Content-Type of a File.
		body: file,
	})
	return { status: response.status, body: await response.json() }
}
//#endregion

/** A text file's id, uploaded for `Post.attachments`. */
async function attachment(name: string, text: string): Promise<string> {
	const { body } = await upload(
		'Post.attachments',
		new File([text], name, { type: 'text/plain' }),
	)
	return String(at(body, 'id'))
}

const anId: unknown = expect.any(String)
const aUrl: unknown = expect.stringMatching(/^memory:\/\/files\/public\//)
const aPrivateUrl: unknown = expect.stringMatching(/\?expires=3600$/)

it('uploads a cover, then writes its id in a post', async () => {
	//#region upload
	const cover = new File([png], 'cover.png', { type: 'image/png' })
	const uploaded = await upload('Post.cover', cover)
	expect(uploaded).toEqual({ status: 201, body: { id: anId } })
	const body = await request(
		`mutation ($cover: JSON) {
			createPost(data: { title: "Hello", cover: $cover }) {
				cover { name type size url inline { size { width height } } }
			}
		}`,
		{ cover: at(uploaded.body, 'id') },
	)
	expect(at(body, 'data', 'createPost', 'cover')).toEqual({
		name: 'cover.png',
		type: 'image/png',
		size: png.length,
		url: aUrl,
		inline: { size: { width: 1, height: 1 } },
	})
	//#endregion
})

it('pushes to a list of files, and removes from it', async () => {
	//#region list
	const notes = await attachment('notes.txt', 'Bring the slides.')
	const prices = await attachment('prices.txt', 'Tea: 3, coffee: 4.')
	const created = await request(
		'mutation ($ids: JSON) { createPost(data: { title: "Hi", attachments: $ids }) { id } }',
		{ ids: [notes] },
	)
	const update = `mutation ($id: ID!, $attachments: JSON) {
		updatePost(where: { id: $id }, data: { attachments: $attachments }) {
			attachments { name url variants { preview { type size } } }
		}
	}`
	const id = at(created, 'data', 'createPost', 'id')
	await request(update, { id, attachments: { push: [prices] } })
	const body = await request(update, { id, attachments: { remove: [notes] } })
	expect(at(body, 'data', 'updatePost', 'attachments')).toEqual([
		{
			name: 'prices.txt',
			url: aPrivateUrl,
			variants: { preview: { type: 'text/plain', size: 18 } },
		},
	])
	//#endregion
})

it('refuses a type accept does not list, a large file and a foreign id', async () => {
	//#region refused
	const text = new File(['Not a picture.'], 'cover.txt', {
		type: 'text/plain',
	})
	expect(await upload('Post.cover', text)).toEqual({
		status: 415,
		body: {
			code: 'UNSUPPORTED_MEDIA_TYPE',
			message: 'text/plain is not accepted.',
		},
	})
	const large = new File(['x'.repeat(100_001)], 'big.txt', {
		type: 'text/plain',
	})
	expect(await upload('Post.attachments', large)).toEqual({
		status: 413,
		body: {
			code: 'PAYLOAD_TOO_LARGE',
			message: 'The file is over 100000 bytes.',
		},
	})
	// An attachment's id, written as a cover.
	const notes = await attachment('notes.txt', 'Bring the slides.')
	const body = await request(
		'mutation ($id: JSON) { createPost(data: { title: "Hi", cover: $id }) { id } }',
		{ id: notes },
	)
	expect(body).toMatchObject({
		errors: [
			{
				extensions: {
					code: 'VALIDATION_FAILED',
					details: {
						issues: [
							{
								path: ['cover'],
								message: `${notes} is not a file uploaded for Post.cover.`,
							},
						],
					},
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

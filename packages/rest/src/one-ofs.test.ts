// A `oneOf` over REST (D-247), as GraphQL's: read as its kind and each kind
// a request asks for, filtered by kind, by a kind and by the shared fields,
// written as one kind's `connect`, `connectOrCreate` or `create`.
import { allow, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rest } from './index.ts'
import type { Sent } from './test/app.ts'
import { at, call, M, qs, started } from './test/app.ts'

const Post = defineModel({
	name: 'Post',
	use: [rest()],
	fields: (f) => ({
		title: f.string(),
		meta: f.json({ optional: true }),
		rank: f.number({ optional: true }),
		comments: f.many(() => Comment, { inverse: 'target' }),
	}),
}).with({ access: allow.public })

const Photo = defineModel({
	name: 'Photo',
	use: [rest()],
	fields: (f) => ({
		title: f.string(),
		url: f.string({ unique: true }),
		meta: f.json({ optional: true }),
		rank: f.string({ optional: true }),
		comments: f.many(() => Comment, { inverse: 'target' }),
		notes: f.many(() => Note, { inverse: 'about' }),
	}),
}).with({ access: allow.public })

const Comment = defineModel({
	name: 'Comment',
	use: [rest()],
	fields: (f) => ({
		body: f.string(),
		target: f.oneOf({ post: () => Post, photo: () => Photo }),
	}),
}).with({ access: allow.public })

const Note = defineModel({
	name: 'Note',
	use: [rest()],
	fields: (f) => ({
		text: f.string(),
		about: f.oneOf(
			{ post: () => Post, photo: () => Photo },
			{ optional: true, description: 'What the note is about.' },
		),
	}),
}).with({ access: allow.public })

const Clip = defineModel({
	name: 'Clip',
	use: [rest()],
	fields: (f) => ({
		name: f.string(),
		pins: f.many(() => Pin, { inverse: 'on' }),
	}),
}).with({ access: allow.public, rest: false })

const Reel = defineModel({
	name: 'Reel',
	use: [rest()],
	fields: (f) => ({
		name: f.string(),
		pins: f.many(() => Pin, { inverse: 'on' }),
	}),
}).with({ access: allow.public, rest: false })

const Pin = defineModel({
	name: 'Pin',
	use: [rest()],
	fields: (f) => ({
		on: f.oneOf({ clip: () => Clip, reel: () => Reel }),
	}),
}).with({ access: allow.public })

let running: Awaited<ReturnType<typeof started>>
let loom = ''
let sky = ''
let clip = ''
beforeAll(async () => {
	running = await started(
		{ maxDepth: 3, maxRows: 1000 },
		memory(),
		[],
		[Post, Photo, Comment, Note, Clip, Reel, Pin],
	)
	loom = (await Post.create({ data: { title: 'Loom', meta: { stars: 3 } } }, M))
		.id
	sky = (
		await Photo.create(
			{ data: { title: 'Sky', url: 'sky.png', meta: { stars: 5 } } },
			M,
		)
	).id
	clip = (await Clip.create({ data: { name: 'Intro' } }, M)).id
	await Note.create({ data: { text: 'loose' } }, M)
	await Comment.create(
		{ data: { body: 'a', target: { connect: { post: { id: loom } } } } },
		M,
	)
	await Comment.create(
		{ data: { body: 'b', target: { connect: { photo: { id: sky } } } } },
		M,
	)
})
afterAll(async () => running.app.stop())

const get = (path: string, params: Record<string, unknown>): Promise<Sent> =>
	call(running.url, 'GET', `${path}${qs(params)}`)

const write = (
	method: string,
	path: string,
	body: unknown,
	params: Record<string, unknown> = {},
): Promise<Sent> => call(running.url, method, `${path}${qs(params)}`, { body })

const nodes = (sent: Sent): unknown => {
	const edges = at(sent.body, 'edges')
	return Array.isArray(edges) ? edges.map((edge) => at(edge, 'node')) : edges
}

const bodies = async (where: unknown): Promise<unknown> =>
	nodes(
		await get('/api/comments', {
			where,
			orderBy: { body: 'asc' },
			select: { body: true },
		}),
	)

const listed = (...list: readonly string[]) => list.map((body) => ({ body }))

const refused = (message: string, path?: string): Sent => ({
	status: 400,
	body: {
		code: 'BAD_USER_INPUT',
		message,
		...(path === undefined ? {} : { details: { path } }),
	},
})

const schemaOf = async (name: string): Promise<unknown> =>
	at((await get('/api/openapi.json', {})).body, 'components', 'schemas', name)

/** The names of a schema's properties. */
const propertiesOf = (schema: unknown): string[] => {
	const properties = at(schema, 'properties')
	return typeof properties === 'object' && properties !== null
		? Object.keys(properties)
		: []
}

describe('a oneOf over REST', () => {
	it('reads its kind and each kind it asks for', async () => {
		const select = { body: true, target: { post: { select: { title: true } } } }
		expect(
			nodes(await get('/api/comments', { orderBy: { body: 'asc' }, select })),
		).toStrictEqual([
			{ body: 'a', target: { kind: 'post', post: { title: 'Loom' } } },
			{ body: 'b', target: { kind: 'photo', post: null } },
		])
		const all = nodes(
			await get('/api/comments', {
				orderBy: { body: 'asc' },
				select: { body: true, target: true },
			}),
		)
		expect(at(all, 1, 'target', 'kind')).toBe('photo')
		expect(at(all, 1, 'target', 'post')).toBeNull()
		expect(at(all, 1, 'target', 'photo', 'url')).toBe('sky.png')
		const included = nodes(
			await get('/api/comments', {
				orderBy: { body: 'asc' },
				include: { target: { photo: true, post: false } },
			}),
		)
		expect(at(included, 0, 'body')).toBe('a')
		expect(at(included, 0, 'target')).toStrictEqual({
			kind: 'post',
			photo: null,
		})
		const none = nodes(
			await get('/api/notes', { select: { text: true, about: true } }),
		)
		expect(none).toStrictEqual([{ text: 'loose', about: null }])
		expect(
			nodes(await get('/api/comments', { include: { target: false } })),
		).toHaveLength(2)
	})

	it('refuses a read that is not of its kinds', async () => {
		expect(
			await get('/api/comments', { select: { target: 'post' } }),
		).toStrictEqual(
			refused('select.target must be true or an object.', 'select.target'),
		)
		expect(
			await get('/api/comments', { select: { target: { post: 1 } } }),
		).toStrictEqual(
			refused(
				'select.target.post must be true or an object.',
				'select.target.post',
			),
		)
		const video = await get('/api/comments', {
			select: { target: { video: true } },
		})
		expect(video.status).toBe(400)
		expect(at(video.body, 'details', 'path')).toBe('select.target.video')
		const where = await get('/api/comments', {
			select: { target: { post: { where: {} } } },
		})
		expect(at(where.body, 'details', 'path')).toBe('select.target.post.where')
	})

	it('filters by kind, by a kind and by the fields the kinds share', async () => {
		expect(await bodies({ target: { kind: 'photo' } })).toStrictEqual(
			listed('b'),
		)
		expect(
			await bodies({
				target: { photo: { is: { url: { equals: 'sky.png' } } } },
			}),
		).toStrictEqual(listed('b'))
		expect(
			await bodies({ target: { is: { title: { startsWith: 'L' } } } }),
		).toStrictEqual(listed('a'))
		expect(
			await bodies({
				target: { isNot: { meta: { path: ['stars'], gt: 4 } } },
			}),
		).toStrictEqual(listed('a'))
		expect(
			await bodies({
				target: { is: { createdAt: { lte: new Date().toISOString() } } },
			}),
		).toStrictEqual(listed('a', 'b'))
		expect(
			await bodies({
				target: {
					post: { is: { createdAt: { gte: '2000-01-01T00:00:00.000Z' } } },
				},
			}),
		).toStrictEqual(listed('a'))
		const loose = await get('/api/notes', {
			where: { about: { is: null } },
			select: { text: true },
		})
		expect(nodes(loose)).toStrictEqual([{ text: 'loose' }])
	})

	it('writes a kind by connect, create or connectOrCreate', async () => {
		const created = await write(
			'POST',
			'/api/comments',
			{ body: 'c', target: { create: { post: { title: 'New' } } } },
			{ select: { target: { post: { select: { title: true } } } } },
		)
		expect(created).toStrictEqual({
			status: 201,
			body: {
				target: { kind: 'post', post: { title: 'New' } },
			},
		})
		const found = await write(
			'POST',
			'/api/comments',
			{
				body: 'd',
				target: {
					connectOrCreate: {
						photo: {
							where: { url: 'sky.png' },
							create: { title: 'Sky', url: 'sky.png' },
						},
					},
				},
			},
			{ select: { target: { photo: { select: { id: true } } } } },
		)
		expect(at(found.body, 'target', 'photo', 'id')).toBe(sky)
		const deep = await write(
			'POST',
			'/api/posts',
			{ title: 'Deep', comments: { create: [{ body: 'e' }] } },
			{ select: { comments: { select: { body: true, target: true } } } },
		)
		expect(at(deep.body, 'comments', 'edges', 0, 'node', 'body')).toBe('e')
		expect(
			at(deep.body, 'comments', 'edges', 0, 'node', 'target', 'kind'),
		).toBe('post')
		const pinned = await write(
			'POST',
			'/api/pins',
			{ on: { connect: { clip: { id: clip } } } },
			{ select: { on: { clip: { select: { name: true } } } } },
		)
		expect(at(pinned.body, 'on')).toStrictEqual({
			kind: 'clip',
			clip: { name: 'Intro' },
		})
	})

	it('only connects a hidden kind', async () => {
		const sent = await write('POST', '/api/pins', {
			on: { create: { clip: { name: 'Outro' } } },
		})
		expect(sent.status).toBe(400)
		expect(at(sent.body, 'details', 'path')).toBe('data.on.create.clip')
	})

	it('disconnects an optional oneOf', async () => {
		const created = await write(
			'POST',
			'/api/notes',
			{ text: 'n', about: { connect: { photo: { id: sky } } } },
			{ select: { id: true, about: true } },
		)
		expect(at(created.body, 'about', 'kind')).toBe('photo')
		const id = String(at(created.body, 'id'))
		const updated = await write(
			'PATCH',
			`/api/notes/${id}`,
			{ about: { disconnect: true } },
			{ select: { id: true, about: true } },
		)
		expect(updated).toStrictEqual({ status: 200, body: { id, about: null } })
	})

	it('counts its kinds as one level and the kind that reads the most', async () => {
		const deep = {
			post: { include: { comments: { include: { target: true } } } },
		}
		expect(
			await get('/api/comments', { include: { target: deep } }),
		).toStrictEqual(
			refused(
				'The request is nested 4 levels deep, its orderBy included; the most is 3.',
			),
		)
		const post = { post: { include: { comments: { first: 100 } } } }
		expect(
			await get('/api/comments', { first: 10, include: { target: post } }),
		).toStrictEqual(
			refused(
				'The request asks for more than 1,000 rows. Ask for fewer with first or last.',
			),
		)
		const photo = { photo: { include: { comments: { first: 50 } } } }
		expect(
			(await get('/api/comments', { first: 10, include: { target: photo } }))
				.status,
		).toBe(200)
	})

	it('is described as GraphQL types it', async () => {
		expect(await schemaOf('CommentTarget')).toStrictEqual({
			type: 'object',
			properties: {
				kind: { $ref: '#/components/schemas/CommentTargetKind' },
				post: {
					anyOf: [{ $ref: '#/components/schemas/Post' }, { type: 'null' }],
				},
				photo: {
					anyOf: [{ $ref: '#/components/schemas/Photo' }, { type: 'null' }],
				},
			},
			required: ['kind'],
			additionalProperties: false,
		})
		expect(await schemaOf('CommentTargetKind')).toStrictEqual({
			type: 'string',
			enum: ['post', 'photo'],
		})
		const filter = await schemaOf('CommentTargetFilter')
		expect(propertiesOf(filter)).toStrictEqual([
			'is',
			'isNot',
			'kind',
			'post',
			'photo',
		])
		const shared = propertiesOf(await schemaOf('CommentTargetSharedWhereInput'))
		expect(shared).toContain('title')
		expect(shared).toContain('meta')
		expect(shared).toContain('comments')
		expect(shared).not.toContain('url')
		expect(shared).not.toContain('rank')
		const note = await schemaOf('Note')
		expect(at(note, 'properties', 'about', 'description')).toBe(
			'What the note is about.',
		)
	})

	it('describes the writes of one kind', async () => {
		const nested = await schemaOf('CommentTargetCreateNestedInput')
		expect(propertiesOf(nested)).toStrictEqual([
			'connect',
			'connectOrCreate',
			'create',
		])
		expect(at(nested, 'maxProperties')).toBe(1)
		const update = await schemaOf('NoteAboutUpdateNestedInput')
		expect(at(update, 'properties', 'disconnect')).toStrictEqual({
			type: 'boolean',
		})
		expect(
			at(await schemaOf('CommentTargetUpdateNestedInput'), 'properties'),
		).not.toHaveProperty('disconnect')
		expect(
			propertiesOf(await schemaOf('PinOnCreateNestedInput')),
		).toStrictEqual(['connect'])
		expect(
			at(await schemaOf('CommentCreateWithoutTargetInput'), 'properties'),
		).toStrictEqual({ body: { type: 'string' } })
		expect(
			at(await schemaOf('PostCreateInput'), 'properties', 'comments'),
		).toStrictEqual({
			$ref: '#/components/schemas/CommentCreateNestedManyWithoutTargetInput',
		})
		expect(at(await schemaOf('CommentCreateInput'), 'required')).toStrictEqual([
			'body',
			'target',
		])
	})
})

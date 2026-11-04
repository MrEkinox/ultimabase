// A `oneOf` over GraphQL (D-247): an object type of its kind and each kind's
// row, a filter by kind, by a kind and by the shared fields, and `@oneOf`
// writes of kinds.
import type { GraphQLSchema } from 'graphql'
import { isInputObjectType, isObjectType, printType } from 'graphql'
import { allow, defineModel, memory } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { graphql } from './index.ts'
import { M, post, started } from './test/app.ts'

const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		meta: f.json({ optional: true }),
		rank: f.number({ optional: true }),
		comments: f.many(() => Comment, { inverse: 'target' }),
	}),
}).with({ access: allow.public })

const Photo = defineModel({
	name: 'Photo',
	use: [graphql()],
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
	use: [graphql()],
	fields: (f) => ({
		body: f.string(),
		target: f.oneOf({ post: () => Post, photo: () => Photo }),
	}),
}).with({ access: allow.public })

const Note = defineModel({
	name: 'Note',
	use: [graphql()],
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
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		pins: f.many(() => Pin, { inverse: 'on' }),
	}),
}).with({ access: allow.public, graphql: false })

const Reel = defineModel({
	name: 'Reel',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		pins: f.many(() => Pin, { inverse: 'on' }),
	}),
}).with({ access: allow.public, graphql: false })

const Pin = defineModel({
	name: 'Pin',
	use: [graphql()],
	fields: (f) => ({
		on: f.oneOf({ clip: () => Clip, reel: () => Reel }),
	}),
}).with({ access: allow.public })

let schema: GraphQLSchema | undefined
let running: Awaited<ReturnType<typeof started>>
let photo = ''
beforeAll(async () => {
	running = await started(
		{
			extend: (generated) => {
				schema = generated
				return generated
			},
		},
		memory(),
		[],
		[],
		[Post, Photo, Comment, Note, Clip, Reel, Pin],
	)
	const loom = await Post.create(
		{ data: { title: 'Loom', meta: { stars: 3 } } },
		M,
	)
	const sky = await Photo.create(
		{ data: { title: 'Sky', url: 'sky.png', meta: { stars: 5 } } },
		M,
	)
	photo = sky.id
	await Comment.create(
		{ data: { body: 'a', target: { connect: { post: { id: loom.id } } } } },
		M,
	)
	await Comment.create(
		{ data: { body: 'b', target: { connect: { photo: { id: sky.id } } } } },
		M,
	)
})
afterAll(async () => running.app.stop())

const printed = (name: string): string => {
	const type = schema?.getType(name)
	return isObjectType(type) || isInputObjectType(type) ? printType(type) : ''
}

const ask = async (document: string): Promise<unknown> =>
	post(`${running.url}/graphql`, document)

const bodies = async (where: string): Promise<unknown> =>
	ask(
		`{ comments(where: ${where}, orderBy: { body: asc }) { edges { node { body } } } }`,
	)

const bodied = (...list: readonly string[]) => ({
	data: { comments: { edges: list.map((body) => ({ node: { body } })) } },
})

describe('a oneOf over GraphQL', () => {
	it('is an object of its kind and each kind, not a union', () => {
		expect(printed('CommentTarget')).toBe(
			'type CommentTarget {\n  kind: CommentTargetKind!\n  post: Post\n  photo: Photo\n}',
		)
		expect(printed('Comment')).toContain('target: CommentTarget!\n')
		expect(printed('Comment')).not.toContain('targetPost')
		expect(printed('Note')).toContain(
			'"""What the note is about."""\n  about: NoteAbout\n',
		)
	})

	it('reads each row with its kind, shaped by what it selects', async () => {
		expect(
			await ask(
				'{ comments(orderBy: { body: asc }) { edges { node { body target { kind post { title } ... on CommentTarget { photo { url } } } } } } }',
			),
		).toStrictEqual({
			data: {
				comments: {
					edges: [
						{
							node: {
								body: 'a',
								target: { kind: 'post', post: { title: 'Loom' }, photo: null },
							},
						},
						{
							node: {
								body: 'b',
								target: {
									kind: 'photo',
									post: null,
									photo: { url: 'sky.png' },
								},
							},
						},
					],
				},
			},
		})
		expect(
			await ask(
				'{ notes { edges { node { about { kind } } } } posts { edges { node { comments { totalCount } } } } }',
			),
		).toStrictEqual({
			data: {
				notes: { edges: [] },
				posts: { edges: [{ node: { comments: { totalCount: 1 } } }] },
			},
		})
	})

	it('filters by kind, by a kind and by the fields the kinds share', async () => {
		expect(printed('CommentTargetFilter')).toBe(
			'input CommentTargetFilter {\n  is: CommentTargetSharedWhereInput\n  isNot: CommentTargetSharedWhereInput\n  kind: CommentTargetKind\n  post: PostRelationFilter\n  photo: PhotoRelationFilter\n}',
		)
		const shared = printed('CommentTargetSharedWhereInput')
		expect(shared).toContain('title: StringFilter\n')
		expect(shared).toContain('meta: JSONFilter\n')
		expect(shared).not.toContain('url')
		expect(shared).not.toContain('rank')
		expect(shared).toContain('comments: CommentListRelationFilter\n')
		expect(await bodies('{ target: { kind: photo } }')).toStrictEqual(
			bodied('b'),
		)
		expect(
			await bodies(
				'{ target: { photo: { is: { url: { equals: "sky.png" } } } } }',
			),
		).toStrictEqual(bodied('b'))
		expect(
			await bodies('{ target: { is: { title: { startsWith: "L" } } } }'),
		).toStrictEqual(bodied('a'))
		expect(
			await bodies(
				'{ target: { isNot: { meta: { path: ["stars"], gt: 4 } } } }',
			),
		).toStrictEqual(bodied('a'))
		expect(
			await bodies(
				'{ OR: [{ target: { is: { OR: [{ title: { equals: "Sky" } }] } } }] }',
			),
		).toStrictEqual(bodied('b'))
	})

	it('writes a kind by connect, create or connectOrCreate', async () => {
		expect(printed('CommentTargetCreateNestedInput')).toBe(
			'input CommentTargetCreateNestedInput @oneOf {\n  connect: CommentTargetConnectInput\n  connectOrCreate: CommentTargetCreateOrConnectInput\n  create: CommentTargetCreateInput\n}',
		)
		expect(printed('CommentCreateInput')).toContain(
			'target: CommentTargetCreateNestedInput!\n',
		)
		expect(printed('CommentUpdateInput')).toContain(
			'target: CommentTargetUpdateNestedInput\n',
		)
		expect(printed('CommentTargetUpdateNestedInput')).not.toContain(
			'disconnect',
		)
		expect(printed('NoteAboutUpdateNestedInput')).toContain(
			'disconnect: Boolean\n',
		)
		expect(printed('PostCreateInput')).toContain(
			'comments: CommentCreateNestedManyWithoutTargetInput\n',
		)
		expect(printed('CommentCreateWithoutTargetInput')).toBe(
			'input CommentCreateWithoutTargetInput {\n  body: String!\n}',
		)
		expect(
			await ask(
				'mutation { createComment(data: { body: "c", target: { create: { post: { title: "New", meta: { stars: 1 } } } } }) { target { kind post { title } } } }',
			),
		).toStrictEqual({
			data: {
				createComment: { target: { kind: 'post', post: { title: 'New' } } },
			},
		})
		expect(
			await ask(
				'mutation { createComment(data: { body: "d", target: { connectOrCreate: { photo: { where: { url: "sky.png" }, create: { title: "Sky", url: "sky.png" } } } } }) { target { photo { title } } } }',
			),
		).toStrictEqual({
			data: { createComment: { target: { photo: { title: 'Sky' } } } },
		})
		expect(
			await ask(
				'mutation { createPost(data: { title: "Deep", comments: { create: [{ body: "e" }] } }) { comments { edges { node { body target { kind } } } } } }',
			),
		).toStrictEqual({
			data: {
				createPost: {
					comments: {
						edges: [{ node: { body: 'e', target: { kind: 'post' } } }],
					},
				},
			},
		})
	})

	it('only connects the kinds a client does not create', () => {
		expect(printed('PinOnCreateNestedInput')).toBe(
			'input PinOnCreateNestedInput @oneOf {\n  connect: PinOnConnectInput\n}',
		)
		expect(printed('PinOnConnectInput')).toBe(
			'input PinOnConnectInput @oneOf {\n  clip: ConnectInput\n  reel: ConnectInput\n}',
		)
	})

	it('disconnects an optional oneOf', async () => {
		const created = await ask(
			`mutation { createNote(data: { text: "n", about: { connect: { photo: { id: "${photo}" } } } }) { id about { kind } } }`,
		)
		expect(created).toMatchObject({
			data: { createNote: { about: { kind: 'photo' } } },
		})
		const id = String(
			Reflect.get(
				Object(
					Reflect.get(
						Object(Reflect.get(Object(created), 'data')),
						'createNote',
					),
				),
				'id',
			),
		)
		expect(
			await ask(
				`mutation { updateNote(where: { id: "${id}" }, data: { about: { disconnect: true } }) { about { kind } } }`,
			),
		).toStrictEqual({ data: { updateNote: { about: null } } })
	})
})

// What counts as a level of `maxDepth` (D-185): a model's field does, a
// generated connection's or edge's does not, whatever its name; with
// `pagination: 'list'` every field does.
import { allow, defineModel, master, memory } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import type { GraphqlOptions } from './index.ts'
import { graphql } from './index.ts'
import { asMaster, at, post, started } from './test/app.ts'

const M = { as: master }

const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		comments: f.many(() => Comment, { inverse: 'post' }),
		mentions: f.many(() => Comment, { inverse: 'node' }),
	}),
}).with({ access: allow.readOnly })

const Comment = defineModel({
	name: 'Comment',
	use: [graphql()],
	fields: (f) => ({
		body: f.string(),
		post: f.one(() => Post),
		// A model's own field named like an edge's still counts.
		node: f.one(() => Post, { optional: true }),
		photos: f.many(() => Photo),
	}),
}).with({ access: allow.readOnly })

const Photo = defineModel({
	name: 'Photo',
	use: [graphql()],
	fields: (f) => ({
		comment: f.one(() => Comment),
		file: f.one(() => File, { optional: true }),
	}),
}).with({ access: allow.readOnly })

const File = defineModel({
	name: 'File',
	use: [graphql()],
	fields: (f) => ({ url: f.string(), photos: f.many(() => Photo) }),
}).with({ access: allow.readOnly })

/** Runs `check` against an application of these models, seeded. */
async function serving(
	options: GraphqlOptions,
	check: (url: string) => Promise<void>,
): Promise<void> {
	const running = await started(
		options,
		memory(),
		[],
		[],
		[Post, Comment, Photo, File],
	)
	try {
		const file = await File.create({ data: { url: 'a.png' } }, M)
		const article = await Post.create({ data: { title: 'one' } }, M)
		const comment = await Comment.create(
			{
				data: {
					body: 'nice',
					post: { connect: { id: article.id } },
					node: { connect: { id: article.id } },
				},
			},
			M,
		)
		await Photo.create(
			{
				data: {
					comment: { connect: { id: comment.id } },
					file: { connect: { id: file.id } },
				},
			},
			M,
		)
		await check(`${running.url}/graphql`)
	} finally {
		await running.app.stop()
	}
}

const messages = (result: { errors?: readonly { message: string }[] }) =>
	result.errors?.map((error) => error.message)

/** A post's comments and the post each names, `levels` times, then its title. */
const nested = (levels: number): string =>
	levels === 0
		? 'title'
		: `comments(first: 1) { edges { node { node { ${nested(levels - 1)} } } } }`

describe('the depth of a connection', () => {
	it('counts posts, comments, photos, file and url: 5 levels', async () => {
		await serving({}, async (url) => {
			const result = await post(
				url,
				`{ posts(first: 10) { edges { node {
					title
					comments(first: 3) { edges { node {
						body
						photos(first: 1) { edges { node { file { url } } } }
					} } }
				} } } }`,
			)
			expect(result.errors).toBeUndefined()
			const posts = at(result.data, 'posts', 'edges', 0, 'node')
			const comment = at(posts, 'comments', 'edges', 0, 'node')
			const photo = at(comment, 'photos', 'edges', 0, 'node')
			expect(at(photo, 'file', 'url')).toBe('a.png')
		})
	})

	it('refuses more than 10 model levels at the default maxDepth', async () => {
		await serving({}, async (url) => {
			// posts, comments and node five times, and title: 12 levels.
			const deep = `{ posts { edges { node { ${nested(5)} } } } }`
			expect(messages(await post(url, deep))).toStrictEqual([
				'The document is nested 12 levels deep; the most is 10.',
			])
			// posts, comments and node four times, and title: 10 levels.
			const ten = `{ posts { edges { node { ${nested(4)} } } } }`
			expect((await post(url, ten)).errors).toBeUndefined()
		})
	})

	it("counts a model's field named node, and no field of a connection", async () => {
		await serving({ maxDepth: 2 }, async (url) => {
			const named = `{ comments { edges { node { node { title } } } } }`
			expect(messages(await post(url, named))).toStrictEqual([
				'The document is nested 3 levels deep; the most is 2.',
			])
			const wrappers = await post(
				url,
				`{ comments {
					totalCount pageInfo { hasNextPage }
					edges { cursor node { body } }
				} }`,
			)
			expect(wrappers.errors).toBeUndefined()
		})
	})

	it('counts the levels of an orderBy below a connection', async () => {
		await serving({ maxDepth: 3 }, async (url) => {
			const through = `query ($orderBy: [CommentOrderByInput!]) {
				posts { edges { node { comments(orderBy: $orderBy) { totalCount } } } }
			}`
			const one = { orderBy: [{ post: { title: 'asc' } }] }
			expect((await post(url, through, one)).errors).toBeUndefined()
			const two = { orderBy: [{ post: { comments: { _count: 'asc' } } }] }
			expect(messages(await post(url, through, two))).toStrictEqual([
				'The document is nested 4 levels deep, its orderBy included; the most is 3.',
			])
		})
	})

	it('refuses a field the type does not have', async () => {
		await serving({ maxDepth: 2 }, async (url) => {
			const unknown = await post(url, `{ posts { edges { nope { title } } } }`)
			expect(messages(unknown)).toStrictEqual([
				'Cannot query field "nope" on type "PostEdge". Did you mean "node"?',
			])
		})
	})
})

describe("pagination: 'list'", () => {
	it('counts each field as a level', async () => {
		await serving({ pagination: 'list', maxDepth: 2 }, async (url) => {
			const deep = `{ posts { comments { body } } }`
			expect(messages(await post(url, deep))).toStrictEqual([
				'The document is nested 3 levels deep; the most is 2.',
			])
			const asked = await post(url, deep, undefined, asMaster)
			expect(asked.errors).toBeUndefined()
			expect((await post(url, `{ posts { title } }`)).errors).toBeUndefined()
		})
	})
})

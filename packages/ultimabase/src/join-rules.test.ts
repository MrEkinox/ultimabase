// A many-to-many link written from either side passes both fields' write
// rules (D-213).
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	allow,
	defineApp,
	defineModel,
	master,
	memory,
	PublicError,
} from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }

// What the `posts` rule saw, each time it ran.
const seen: object[] = []

// Ada may create a tag, but not one linked from a post; a hidden tag is
// not found.
const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		name: f.string(),
		hidden: f.boolean({ default: false }),
		posts: f
			.many(() => Post, { inverse: 'tags' })
			.with({
				access: {
					create: (facts) => {
						seen.push(facts)
						return false
					},
					update: (facts) => {
						seen.push(facts)
						return facts.record.name !== 'locked'
					},
				},
			}),
	}),
}).with({
	access: { read: ({ where }) => where({ hidden: false }), create: () => true },
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		tags: f.many(() => Tag, { inverse: 'posts' }),
	}),
}).with({ access: allow.public })

async function codeOf(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run()
	} catch (error) {
		if (error instanceof PublicError)
			return { code: error.code, details: error.details }
		throw error
	}
	return undefined
}

let app: ReturnType<typeof defineApp>
let ids: { post: string; open: string; locked: string; hidden: string }
beforeEach(async () => {
	seen.length = 0
	app = defineApp({ database: memory(), models: [Tag, Post] })
	await app.start()
	const post = await Post.create({ data: { title: 'p' } }, M)
	const tag = async (name: string, hidden = false) =>
		(await Tag.create({ data: { name, hidden } }, M)).id
	ids = {
		post: post.id,
		open: await tag('open'),
		locked: await tag('locked'),
		hidden: await tag('hidden', true),
	}
})
afterEach(async () => app.stop())

const tagsOf = async (): Promise<string[]> => {
	const post = await Post.findUnique(
		{ where: { id: ids.post }, include: { tags: true } },
		M,
	)
	return (post?.tags ?? []).map((tag) => tag.name).toSorted()
}

const linking = (tags: object) => async () =>
	Post.update({ where: { id: ids.post }, data: { tags } }, ada)

describe('a link written from the other side', () => {
	it("runs the other field's update rule on each row, with its record", async () => {
		await linking({ connect: [{ id: ids.open }] })()
		expect(await tagsOf()).toEqual(['open'])
		expect(seen).toMatchObject([
			{
				operation: 'update',
				record: { id: ids.open, name: 'open' },
				value: {
					connect: [{ id: ids.post }],
					disconnect: [],
					delete: [],
					create: [],
				},
			},
		])
	})

	it('is refused, and links nothing, when that rule refuses', async () => {
		const error = await codeOf(
			linking({ connect: [{ id: ids.open }, { id: ids.locked }] }),
		)
		expect(error).toMatchObject({
			code: 'ACCESS_DENIED',
			details: {
				model: 'Tag',
				operation: 'update',
				field: 'posts',
				via: 'Post.tags',
			},
		})
		expect(await tagsOf()).toEqual([])
	})

	it('runs that rule on a disconnect and on a set', async () => {
		await Post.update(
			{
				where: { id: ids.post },
				data: { tags: { connect: [{ id: ids.locked }] } },
			},
			M,
		)
		expect(
			await codeOf(linking({ disconnect: [{ id: ids.locked }] })),
		).toMatchObject({ code: 'ACCESS_DENIED' })
		expect(seen).toMatchObject([
			{ value: { connect: [], disconnect: [{ id: ids.post }] } },
		])
		expect(await codeOf(linking({ set: [] }))).toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(await tagsOf()).toEqual(['locked'])
	})

	it('runs its create rule on a row created to be linked', async () => {
		const error = await codeOf(linking({ create: [{ name: 'new' }] }))
		expect(error).toMatchObject({
			code: 'ACCESS_DENIED',
			details: { model: 'Tag', operation: 'create', field: 'posts' },
		})
		expect(seen).toMatchObject([
			{ operation: 'create', value: { connect: [{ id: ids.post }] } },
		])
	})

	it('leaves a row the caller cannot read to NOT_FOUND', async () => {
		const error = await codeOf(linking({ connect: [{ id: ids.hidden }] }))
		expect(error).toMatchObject({ code: 'NOT_FOUND' })
		expect(seen).toEqual([])
	})

	it("needs the target's read rule, not its update rule", async () => {
		// Tag has no update rule: closed, yet a reader links it (D-124).
		await linking({ connect: [{ id: ids.open }] })()
		expect(await tagsOf()).toEqual(['open'])
	})

	it('runs no rule for Master', async () => {
		await Post.update(
			{
				where: { id: ids.post },
				data: { tags: { connect: [{ id: ids.locked }] } },
			},
			M,
		)
		expect(seen).toEqual([])
		expect(await tagsOf()).toEqual(['locked'])
	})
})

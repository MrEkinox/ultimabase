// List updates (D-149): `set`, `push`, `pushUnique` or `remove`, with an
// element or a list, computed on the row the update finds, which every rule,
// schema and hook then sees, nested writes included.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import type { UpdateDataOf } from './index.ts'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const user = { as: asUser({ id: 'u1' }) }

let seen: unknown[] = []
// A hook, a field rule and a schema: the update reads the row first.
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		tags: f.string({ list: true }).with({
			access: {
				update: ({ value, record }) => {
					seen.push(['rule', value, record.tags])
					return !value.includes('banned')
				},
			},
		}),
		sizes: f.enumOf(['S', 'M', 'L'], {
			list: true,
			validate: z
				.array(z.enum(['S', 'M', 'L']))
				.max(2)
				.readonly(),
		}),
		writer: f.one(() => Writer, { optional: true }),
	}),
}).with({
	access: allow.public,
	hooks: {
		beforeUpdate: ({ data }) => {
			seen.push(['before', data.tags])
		},
	},
})

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({
		names: f.string({ list: true }),
		posts: f.many(() => Post),
	}),
}).with({ access: allow.public })

const started = () => defineApp({ database: memory(), models: [Post, Writer] })
let app: ReturnType<typeof started>
beforeEach(async () => {
	seen = []
	app = started()
	await app.start()
})
afterEach(async () => app.stop())

describe('what a list update shows the rules and hooks', () => {
	it('is the list the row will hold', async () => {
		const post = await Post.create({ data: { tags: ['a'] } }, M)
		seen = []
		const updated = await Post.update(
			{ where: { id: post.id }, data: { tags: { pushUnique: ['a', 'b'] } } },
			user,
		)
		expect(updated).toMatchObject({ tags: ['a', 'b'] })
		expect(seen).toEqual([
			['rule', ['a', 'b'], ['a']],
			['before', ['a', 'b']],
		])
		await expect(
			Post.update(
				{ where: { id: post.id }, data: { tags: { push: 'banned' } } },
				user,
			),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it('validates the result, on the row it reads', async () => {
		const post = await Post.create({ data: { sizes: ['S', 'M'] } }, M)
		await expect(
			Post.update(
				{ where: { id: post.id }, data: { sizes: { push: 'L' } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['sizes'] }] },
		})
		expect(
			await Post.update(
				{ where: { id: post.id }, data: { sizes: { remove: 'S' } } },
				M,
			),
		).toMatchObject({ sizes: ['M'] })
	})
})

describe('a nested list update', () => {
	it('is computed on the row it updates, through either side', async () => {
		const writer = await Writer.create(
			{ data: { names: ['ada'], posts: { create: [{ tags: ['x'] }] } } },
			M,
		)
		const [post] = await Post.findMany({}, M)
		if (post === undefined) throw new Error('No post.')
		await Post.update(
			{
				where: { id: post.id },
				data: { writer: { update: { names: { push: 'lovelace' } } } },
			},
			M,
		)
		await Writer.update(
			{
				where: { id: writer.id },
				data: {
					posts: {
						update: [
							{ where: { id: post.id }, data: { tags: { remove: 'x' } } },
						],
					},
				},
			},
			M,
		)
		expect(
			await Writer.findUnique(
				{ where: { id: writer.id }, include: { posts: true } },
				M,
			),
		).toMatchObject({ names: ['ada', 'lovelace'], posts: [{ tags: [] }] })
	})

	it('refuses a nested operation that is not one', async () => {
		const post = await Post.create({ data: { writer: { create: {} } } }, M)
		await expect(
			Post.update(
				{
					where: { id: post.id },
					// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types refuse.
					data: { writer: { update: { names: {} as [] } } },
				},
				M,
			),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'data.writer.update.names takes a list or one of set, push, pushUnique, remove.',
		})
	})
})

describe('the types of a list update', () => {
	it('take one operation on the elements of a list, on a list only', () => {
		type Data = UpdateDataOf<typeof Post>
		expectTypeOf<{ tags: { push: 'a' } }>().toExtend<Data>()
		expectTypeOf<{ tags: { pushUnique: ['a', 'b'] } }>().toExtend<Data>()
		expectTypeOf<{ sizes: { remove: 'S' } }>().toExtend<Data>()
		expectTypeOf<{ sizes: { set: ['S'] } }>().toExtend<Data>()
		expectTypeOf<{ sizes: { push: 'XL' } }>().not.toExtend<Data>()
		expectTypeOf<{
			tags: { push: 'a'; remove: 'b' }
		}>().not.toExtend<Data>()
		expectTypeOf<{ tags: { increment: 1 } }>().not.toExtend<Data>()
		expectTypeOf<{ tags: { push: 1 } }>().not.toExtend<Data>()
		type Named = UpdateDataOf<typeof Writer>
		expectTypeOf<{ names: { remove: ['ada'] } }>().toExtend<Named>()
	})
})

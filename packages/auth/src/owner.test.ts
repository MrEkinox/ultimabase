// `isOwner` on the value written (D-79): a post is created and kept in its
// author's name only, the caller's own.
import { httpPlugin } from '@ultimabase/http'
import type { Caller, Logger } from 'ultimabase'
import { allow, defineApp, defineModel, memory } from 'ultimabase'
import { afterEach, describe, expect, it } from 'vitest'
import { authPlugin, currentUser, defineUser, isOwner } from './index.ts'
import { M } from './test/app.ts'

const quiet: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => quiet,
}

const User = defineUser({
	name: 'User',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
}).with({ access: allow.readOnly })

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		author: f.one(() => User, { default: currentUser, optional: true }),
	}),
}).with({
	access: {
		read: allow.public,
		create: isOwner('author'),
		update: isOwner('author'),
	},
})

const as = (id: string): { as: Caller } => ({
	as: { kind: 'user', user: { id } },
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function started() {
	const app = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0 }), authPlugin()],
		models: [User, Post],
		logger: quiet,
	})
	await app.start()
	stop = async () => app.stop()
	const mallory = await User.create({ data: { name: 'mallory' } }, M)
	const victim = await User.create({ data: { name: 'victim' } }, M)
	const post = await Post.create(
		{ data: { title: 'Mine', author: { connect: { id: mallory.id } } } },
		M,
	)
	return { mallory, victim, post }
}

const codeOf = async (write: Promise<unknown>): Promise<string> =>
	write.then(
		() => 'written',
		(error: unknown) => String(Reflect.get(Object(error), 'code')),
	)

describe('isOwner on the value written', () => {
	it('refuses a post created in another user’s name', async () => {
		const { mallory, victim } = await started()
		const data = { title: 'I quit', author: { connect: { id: victim.id } } }
		expect(await codeOf(Post.create({ data }, as(mallory.id)))).toBe(
			'ACCESS_DENIED',
		)
	})

	it('creates a post in the caller’s name, given or by default', async () => {
		const { mallory } = await started()
		const own = { title: 'Mine', author: { connect: { id: mallory.id } } }
		const given = await Post.create(
			{ data: own, include: { author: true } },
			as(mallory.id),
		)
		const defaulted = await Post.create(
			{ data: { title: 'Mine too' }, include: { author: true } },
			as(mallory.id),
		)
		expect([given.author?.id, defaulted.author?.id]).toEqual([
			mallory.id,
			mallory.id,
		])
		const anonymous = { as: { kind: 'anonymous' } } as const
		expect(
			await codeOf(Post.create({ data: { title: 'Who' } }, anonymous)),
		).toBe('ACCESS_DENIED')
	})

	it('refuses an owner handing their post to another user or to no one', async () => {
		const { mallory, victim, post } = await started()
		const where = { id: post.id }
		const handed = { author: { connect: { id: victim.id } } }
		const dropped = { author: { disconnect: true } } as const
		expect(
			await codeOf(Post.update({ where, data: handed }, as(mallory.id))),
		).toBe('ACCESS_DENIED')
		expect(
			await codeOf(Post.update({ where, data: dropped }, as(mallory.id))),
		).toBe('ACCESS_DENIED')
		const renamed = await Post.update(
			{ where, data: { title: 'Still mine' } },
			as(mallory.id),
		)
		expect(renamed.title).toBe('Still mine')
	})
})

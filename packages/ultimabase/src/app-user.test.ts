// `AppUser` (D-333): a plugin's own model relates to the application's user
// model, resolved at startup; the user model gains no field, and a deleted
// user takes the rows that cascade with it.
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginTypes } from './index.ts'
import {
	AppUser,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }
const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

const users = definePlugin({ name: 'users', userModel: true })
const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({ name: f.string() }),
})

const Badge = defineModel({
	name: 'BadgesBadge',
	fields: (f) => ({
		label: f.string(),
		holder: f.one(() => AppUser, { onDelete: 'cascade' }),
	}),
	indexes: [{ fields: ['holder', 'label'], unique: true }],
})
interface Badges extends PluginTypes {
	readonly name: 'badges'
}
const badges = definePlugin<Badges>({
	name: 'badges',
	manifest,
	models: [Badge],
})

const app = defineApp({
	database: memory(),
	plugins: [users.plugin(), badges.plugin()],
	models: [Account],
})
afterEach(async () => app.stop())

describe('a relation to AppUser', () => {
	it('relates to the user model, which gains no field', () => {
		const schema = schemaOf({
			database: memory(),
			plugins: [users.plugin(), badges.plugin()],
			models: [Account],
		})
		const fields = (name: string) =>
			schema.models
				.find((model) => model.name === name)
				?.fields.map((field) => [field.name, field.kind])
		expect(fields('BadgesBadge')).toContainEqual(['holder', 'one'])
		const holder = schema.models
			.find((model) => model.name === 'BadgesBadge')
			?.fields.find((field) => field.name === 'holder')
		expect(holder).toMatchObject({ target: 'Account', stored: true })
		expect(fields('Account')).not.toContainEqual(
			expect.arrayContaining(['many']),
		)
	})

	it('connects, filters, includes, and cascades from the user', async () => {
		await app.start()
		const ada = await Account.create({ data: { name: 'Ada' } }, M)
		const grace = await Account.create({ data: { name: 'Grace' } }, M)
		for (const [holder, label] of [
			[ada.id, 'first'],
			[grace.id, 'first'],
		] as const) {
			await Badge.create(
				{ data: { label, holder: { connect: { id: holder } } } },
				M,
			)
		}
		const held = await Badge.findMany(
			{
				where: { holder: { is: { id: ada.id } } },
				include: { holder: { select: { id: true } } },
			},
			M,
		)
		expect(held.map((badge) => badge.holder?.id)).toEqual([ada.id])
		await expect(
			Badge.create(
				{ data: { label: 'first', holder: { connect: { id: ada.id } } } },
				M,
			),
		).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
		await Account.delete({ where: { id: ada.id } }, M)
		const left = await Badge.findMany(
			{ include: { holder: { select: { id: true } } } },
			M,
		)
		expect(left.map((badge) => badge.holder?.id)).toEqual([grace.id])
	})
})

/** The message startup stops with, if it does. */
async function refusal(options: {
	readonly plugins: readonly unknown[]
	readonly models: readonly unknown[]
}): Promise<string | undefined> {
	const made: unknown = Reflect.apply(defineApp, undefined, [
		{ database: memory(), ...options },
	])
	const start: unknown = Reflect.get(Object(made), 'start')
	try {
		if (typeof start === 'function') await Reflect.apply(start, made, [])
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
	const stop: unknown = Reflect.get(Object(made), 'stop')
	if (typeof stop === 'function') await Reflect.apply(stop, made, [])
	return undefined
}

describe('AppUser is refused', () => {
	it('when the application declares no user model', async () => {
		const Plain = defineModel({
			name: 'Plain',
			fields: (f) => ({ name: f.string() }),
		})
		expect(await refusal({ plugins: [badges.plugin()], models: [Plain] })).toBe(
			"BadgesBadge.holder: the badges plugin needs the application's user model, and none is declared.",
		)
	})

	it('on a model of the application', async () => {
		const Post = defineModel({
			name: 'Post',
			fields: (f) => ({ author: f.one(() => AppUser) }),
		})
		expect(
			await refusal({ plugins: [users.plugin()], models: [Account, Post] }),
		).toBe('Post.author: relate to Account itself, not to AppUser.')
		expect(await refusal({ plugins: [], models: [Post] })).toBe(
			'Post.author: relate to the user model itself, not to AppUser.',
		)
	})

	it('in models', async () => {
		expect(
			await refusal({ plugins: [users.plugin()], models: [Account, AppUser] }),
		).toBe(
			'models lists AppUser, which stands for the user model; list the user model instead.',
		)
	})
})

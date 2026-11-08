// A completed caller is kept until something changes it (D-332): a change
// to a model a plugin with `caller` owns or is used by, links to or from it
// included, completes it again; a lost feed keeps nothing until `missed`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Adapter, Changed, Feed, Identity, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'

const M = { as: master }
let calls = 0
/** While set, `caller` waits for it. */
let hold: Promise<void> | undefined

interface Teams extends PluginTypes {
	readonly name: 'teams'
}
const Grant = defineModel({
	name: 'Grant',
	fields: (f) => ({ userId: f.string() }),
})
const teams = definePlugin<Teams>({
	name: 'teams',
	manifest: { name: 'teams', version: '1.0.0' },
	models: [Grant],
	caller: async () => {
		calls += 1
		if (hold !== undefined) await hold
		return { teams: calls }
	},
})

const Team = defineModel({
	name: 'Team',
	use: [teams.use()],
	fields: (f) => ({ name: f.string() }),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ teams: f.many(() => Team, { inverse: false }) }),
})
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ title: f.string() }),
})

let feed: Feed | undefined
const database = memory()
const watched: Adapter = {
	...database,
	start: async (schema, logger, given) => {
		feed = given
		await database.start(schema, logger, given)
	},
}
const app = defineApp({
	database: watched,
	plugins: [teams.plugin()],
	models: [Team, Member, Note],
})

const ada: Identity = { kind: 'user', user: { id: 'ada' } }
/** How many times `ada` was completed, after a read as her. */
async function completions(): Promise<number> {
	await Note.findMany({}, { as: ada })
	return calls
}
const fed = (): Feed => {
	if (feed === undefined) throw new Error('The kernel takes the feed.')
	return feed
}
const delivered = async () => new Promise((resolve) => setImmediate(resolve))

afterEach(async () => {
	hold = undefined
	await app.stop()
})

describe('a completed caller', () => {
	it('is kept through changes no plugin with caller is given', async () => {
		await app.start()
		const first = await completions()
		await Note.create({ data: { title: 'a' } }, M)
		await Member.create({ data: {} }, M)
		await delivered()
		expect(await completions()).toBe(first)
	})

	it('is completed again once a model of such a plugin changes', async () => {
		await app.start()
		let count = await completions()
		for (const write of [
			async () => Team.create({ data: { name: 'core' } }, M),
			async () => Grant.create({ data: { userId: 'ada' } }, M),
		]) {
			await write()
			await delivered()
			count += 1
			expect(await completions()).toBe(count)
		}
	})

	it('is completed again for a link from either side', async () => {
		await app.start()
		let count = await completions()
		const links: readonly Changed[] = [
			{ kind: 'link', model: 'Member', field: 'teams' },
			{ kind: 'unlink', model: 'Team', field: 'members' },
		]
		for (const link of links) {
			fed().changed([link])
			count += 1
			expect(await completions()).toBe(count)
		}
		// A link of another model, or a field it does not know, keeps it.
		fed().changed([{ kind: 'link', model: 'Note', field: 'teams' }])
		expect(await completions()).toBe(count)
	})

	it('is kept by nothing between a lost feed and missed', async () => {
		await app.start()
		const count = await completions()
		fed().lost()
		await completions()
		expect(await completions()).toBe(count + 2)
		fed().missed()
		await completions()
		expect(await completions()).toBe(count + 3)
	})

	it('is not kept when a change comes while it is completed', async () => {
		await app.start()
		const { promise, resolve } = Promise.withResolvers<void>()
		hold = promise
		const before = calls
		const reading = completions()
		await vi.waitFor(() => expect(calls).toBe(before + 1))
		fed().changed([{ kind: 'update', model: 'Team' }])
		hold = undefined
		resolve()
		const count = await reading
		expect(await completions()).toBe(count + 1)
	})
})

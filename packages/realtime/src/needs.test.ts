// What a row must pass through a relation, asked of the rows a flush holds:
// rows sharing a related row share its answer (D-299).
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { Row } from 'ultimabase'
import { defineApp, defineModel, memory } from 'ultimabase'
import { realtime, realtimePlugin } from './index.ts'
import { Loader } from './loader.ts'
import { Held, possible } from './needs.ts'

const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		name: f.string(),
		members: f.many(() => Member, { inverse: 'team' }),
		posts: f.many(() => Post, { inverse: 'team' }),
	}),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ user: f.string(), team: f.one(() => Team) }),
})
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string(), team: f.one(() => Team) }),
	use: [realtime()],
})

const app = defineApp({
	database: memory(),
	models: [Team, Member, Post],
	plugins: [realtimePlugin()],
})
beforeAll(async () => app.start())
afterAll(async () => app.stop())

const row = (id: string, more: object = {}): Row => ({
	id,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	...more,
})
const posts = ['a', 'b', 'c'].flatMap((team) =>
	[1, 2, 3].map((n) => row(`${team}${n}`, { team })),
)
const members: { readonly [team: string]: readonly Row[] } = {
	a: [row('ma', { user: 'ada', team: 'a' })],
	b: [row('mb', { user: 'bob', team: 'b' })],
	c: [row('mc', { user: 'ada', team: 'c' })],
}
const ofAda = {
	team: { is: { members: { some: { user: { equals: 'ada' } } } } },
}

/** A loader holding the teams and their members, `apart` too many to hold. */
function loaderOf(apart: readonly string[] = []): {
	readonly loader: Loader
	readonly asked: () => number
} {
	const loader = new Loader()
	vi.spyOn(loader, 'load').mockImplementation(
		async (_model, ids) => new Map(ids.map((id) => [id, row(id)])),
	)
	const holding = vi
		.spyOn(loader, 'holding')
		.mockImplementation(
			async (_model, _key, ids) =>
				new Map(
					ids.map((id) => [
						id,
						apart.includes(id) ? undefined : new Held(members[id] ?? []),
					]),
				),
		)
	return { loader, asked: () => holding.mock.calls.length }
}

it('asks once for the rows that share a related row', async () => {
	const { loader, asked } = loaderOf()
	const found = await possible('Post', posts, ofAda, loader)
	expect(found.rows.map(({ id }) => id)).toEqual([
		'a1',
		'a2',
		'a3',
		'c1',
		'c2',
		'c3',
	])
	expect(found.sure).toBe(true)
	expect(asked()).toBe(3)
})

it('leaves a related row too many to hold to the query', async () => {
	const { loader } = loaderOf(['b'])
	const found = await possible('Post', posts, ofAda, loader)
	expect(found.rows.map(({ id }) => id)).toEqual([
		'a1',
		'a2',
		'a3',
		'b1',
		'b2',
		'b3',
		'c1',
		'c2',
		'c3',
	])
	expect(found.sure).toBe(false)
})

it('keeps no row whose related row is gone', async () => {
	const { loader } = loaderOf()
	vi.spyOn(loader, 'load').mockResolvedValue(new Map())
	const found = await possible('Post', posts, ofAda, loader)
	expect(found.rows).toEqual([])
	expect(found.sure).toBe(true)
})

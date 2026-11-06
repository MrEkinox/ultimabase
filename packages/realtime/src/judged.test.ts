// A rule the rows a flush holds answer needs no query (D-259): what those rows
// settle is settled, and whatever they leave out still goes to the database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Adapter, Filter, Row } from 'ultimabase'
import { defineApp, defineModel, master, memory } from 'ultimabase'
import { SharedReads, storedRows } from 'ultimabase/internal'
import { Loader } from './loader.ts'
import { judgeOf, pass } from './reads.ts'

const M = { as: master }

const User = defineModel({
	name: 'User',
	fields: (f) => ({ name: f.string() }),
})
const Chat = defineModel({
	name: 'Chat',
	fields: (f) => ({
		title: f.string(),
		owner: f.one(() => User, { optional: true }),
		members: f.many(() => Member, { inverse: 'chat' }),
		tags: f.many(() => Tag, { inverse: false }),
	}),
})
const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ user: f.one(() => User), chat: f.one(() => Chat) }),
})
const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ label: f.string() }),
})

/** The models of the reads the database ran. */
let finds: string[] = []
const database = memory()
const counted: Adapter = {
	...database,
	find: async (read) => {
		finds.push(read.model)
		return database.find(read)
	},
}
const app = defineApp({ database: counted, models: [User, Chat, Member, Tag] })

let ada = ''
let bob = ''
let mine = ''
let theirs = ''
let rows: ReadonlyMap<string, Row> = new Map()

beforeAll(async () => {
	await app.start()
	ada = (await User.create({ data: { name: 'ada' } }, M)).id
	bob = (await User.create({ data: { name: 'bob' } }, M)).id
	const chat = async (title: string, user: string): Promise<string> => {
		const { id } = await Chat.create(
			{ data: { title, owner: { connect: { id: user } } } },
			M,
		)
		await Member.create(
			{
				data: {
					user: { connect: { id: user } },
					chat: { connect: { id } },
				},
			},
			M,
		)
		return id
	}
	mine = await chat('mine', ada)
	theirs = await chat('theirs', bob)
	const stored = await storedRows('Chat', {})
	rows = new Map(stored.map((row) => [row.id, row]))
})
afterAll(async () => app.stop())
beforeEach(() => {
	finds = []
})

/** A chat of which `user` is a member. */
const memberOf = (user: string): Filter => ({
	members: { some: { user: { is: { id: { equals: user } } } } },
})

describe('a rule the rows held answer', () => {
	it('asks the database nothing of the model itself', async () => {
		const loader = new Loader(new SharedReads())
		const passed = await pass('Chat', rows, memberOf(ada), loader)
		expect(passed).toEqual(new Set([mine]))
		expect(finds).toEqual(['Member'])
		expect(await pass('Chat', rows, memberOf(bob), loader)).toEqual(
			new Set([theirs]),
		)
		// The members were read once, for both rules.
		expect(finds).toEqual(['Member'])
	})

	it('holds through a key the row stores', async () => {
		const owned: Filter = { owner: { is: { name: { equals: 'ada' } } } }
		const passed = await pass(
			'Chat',
			rows,
			owned,
			new Loader(new SharedReads()),
		)
		expect(passed).toEqual(new Set([mine]))
		expect(finds).toEqual(['User'])
	})

	it('holds when each branch of an OR is answered', async () => {
		const either: Filter = {
			OR: [memberOf(ada), { title: { equals: 'theirs' } }],
		}
		const passed = await pass(
			'Chat',
			rows,
			either,
			new Loader(new SharedReads()),
		)
		expect(passed).toEqual(new Set([mine, theirs]))
		expect(finds).not.toContain('Chat')
	})

	it('holds with what the row itself answers', async () => {
		const both: Filter = {
			AND: [{ title: { equals: 'mine' } }, memberOf(ada)],
		}
		const passed = await pass('Chat', rows, both, new Loader(new SharedReads()))
		expect(passed).toEqual(new Set([mine]))
		expect(finds).not.toContain('Chat')
	})
})

describe('a rule the rows held do not settle', () => {
	const unsettled: readonly (readonly [
		string,
		() => Filter,
		() => string[],
	])[] = [
		[
			'names a relation it cannot read back',
			() => ({ tags: { some: { label: { equals: 'x' } } } }),
			() => [],
		],
		[
			'says more than one thing of a relation',
			() => ({
				members: {
					some: { user: { is: { id: { equals: ada } } } },
					none: { user: { is: { id: { equals: bob } } } },
				},
			}),
			() => [mine],
		],
		[
			'requires that no row be related',
			() => ({ members: { none: { user: { is: { id: { equals: ada } } } } } }),
			() => [theirs],
		],
		[
			'has a branch of an OR it cannot read back',
			() => ({
				OR: [memberOf(ada), { tags: { some: { label: { equals: 'x' } } } }],
			}),
			() => [mine],
		],
	]

	it.each(unsettled)(
		'goes to the database when it %s',
		async (_, filter, ids) => {
			const passed = await pass(
				'Chat',
				rows,
				filter(),
				new Loader(new SharedReads()),
			)
			expect(passed).toEqual(new Set(ids()))
			expect(finds).toContain('Chat')
		},
	)

	it('goes to the database past what a read holds', async () => {
		const loader = new Loader(new SharedReads())
		loader.holding = async (_, __, ids) =>
			new Map(ids.map((id) => [id, undefined]))
		const passed = await pass('Chat', rows, memberOf(ada), loader)
		expect(passed).toEqual(new Set([mine]))
		expect(finds).toEqual(['Chat'])
	})
})

describe('a judge', () => {
	it('answers once for a rule, from the rows held', async () => {
		const judge = judgeOf('Chat', rows, new Loader(new SharedReads()))
		const rule = memberOf(ada)
		expect(await judge(rule)).toEqual(new Set([mine]))
		expect(await judge(rule)).toEqual(new Set([mine]))
		expect(finds).toEqual(['Member'])
	})

	it('answers nothing when only a query can tell', async () => {
		const judge = judgeOf('Chat', rows, new Loader(new SharedReads()))
		const rule = { tags: { some: { label: { equals: 'x' } } } }
		expect(await judge(rule)).toBeUndefined()
		expect(finds).toEqual([])
	})

	it('answers with no row left, whatever else the rule says', async () => {
		const judge = judgeOf('Chat', rows, new Loader(new SharedReads()))
		const rule = {
			AND: [
				{ title: { equals: 'nobody' } },
				{ tags: { some: { label: { equals: 'x' } } } },
			],
		}
		expect(await judge(rule)).toEqual(new Set())
		expect(finds).toEqual([])
	})
})

describe('the rows a flush expects (D-261)', () => {
	it('are read together, with the first that asks', async () => {
		const loader = new Loader(new SharedReads())
		loader.expect('Chat', [mine, theirs])
		const first = await loader.load('Chat', [mine])
		expect([...first.keys()]).toEqual([mine])
		const second = await loader.load('Chat', [theirs])
		expect([...second.keys()]).toEqual([theirs])
		expect(finds).toEqual(['Chat'])
	})

	it('are not read when they are more than one read holds', async () => {
		const loader = new Loader(new SharedReads())
		const many = Array.from({ length: 10_001 }, (_, at) => `row-${at}`)
		loader.expect('Chat', many)
		await loader.load('Chat', [mine])
		await loader.load('Chat', [theirs])
		expect(finds).toEqual(['Chat', 'Chat'])
	})
})

const inChat = (title: string): Filter => ({
	chat: { is: { title: { equals: title } } },
})
const held = (row: Row | undefined): ReadonlyMap<string, Row> =>
	new Map(row === undefined ? [] : [[row.id, row]])

describe('the rows related to a flush', () => {
	it('are read together through a key each row stores (D-263)', async () => {
		const members = await storedRows('Member', {})
		const [first, second] = members
		const loader = new Loader()
		loader.keep('Member', members)
		finds = []
		const one = await pass('Member', held(first), inChat('mine'), loader)
		const other = await pass('Member', held(second), inChat('theirs'), loader)
		expect(finds).toEqual(['Chat'])
		expect([...one, ...other].toSorted()).toEqual(
			members.map(({ id }) => id).toSorted(),
		)
	})

	it('are read together through a key they store (D-263)', async () => {
		const loader = new Loader()
		loader.keep('Chat', [...rows.values()])
		const one = await pass('Chat', held(rows.get(mine)), memberOf(ada), loader)
		const other = await pass(
			'Chat',
			held(rows.get(theirs)),
			memberOf(bob),
			loader,
		)
		expect(finds).toEqual(['Member'])
		expect(one).toEqual(new Set([mine]))
		expect(other).toEqual(new Set([theirs]))
	})

	it('stop at what the flush read when it asks (D-263)', async () => {
		const loader = new Loader()
		const asked = rows.get(mine)
		loader.keep('Chat', asked === undefined ? [] : [asked])
		expect(await pass('Chat', held(asked), memberOf(ada), loader)).toEqual(
			new Set([mine]),
		)
		const other = await pass(
			'Chat',
			held(rows.get(theirs)),
			memberOf(bob),
			loader,
		)
		expect(finds).toEqual(['Member', 'Member'])
		expect(other).toEqual(new Set([theirs]))
	})

	it('a row read is given without another read, a deleted one stays missing', async () => {
		const loader = new Loader()
		expect((await loader.load('Chat', [mine, 'gone'])).get(mine)?.id).toBe(mine)
		const again = await loader.load('Chat', [mine, 'gone'])
		expect([...again.keys()]).toEqual([mine])
		expect(finds).toEqual(['Chat'])
	})

	it('are read apart once too many to read together (D-263)', async () => {
		const crowd = await Chat.create({ data: { title: 'crowd' } }, M)
		const data = Array.from({ length: 10_001 }, () => ({
			user: { connect: { id: ada } },
			chat: { connect: { id: crowd.id } },
		}))
		await Member.createMany({ data }, M)
		const loader = new Loader()
		loader.keep('Chat', [...(await storedRows('Chat', {}))])
		finds = []
		// Everyone's rows come back too many: this reader's own go to a query.
		const first = await loader.holding('Member', 'chat', [mine], 'Chat')
		expect(first.get(mine)).toBeUndefined()
		// From then on each reader reads its own, and only the crowd stays open.
		const second = await loader.holding('Member', 'chat', [mine], 'Chat')
		expect(second.get(mine)?.rows.length).toBe(1)
		const third = await loader.holding('Member', 'chat', [crowd.id], 'Chat')
		expect(third.get(crowd.id)).toBeUndefined()
		const fourth = await loader.holding('Member', 'chat', [crowd.id], 'Chat')
		expect(fourth.get(crowd.id)).toBeUndefined()
		expect(finds).toEqual(['Member', 'Member', 'Member'])
	})
})

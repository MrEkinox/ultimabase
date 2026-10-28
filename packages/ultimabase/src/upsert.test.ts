// `upsert` (D-142): an update of the row its unique target finds, or a
// create when the caller finds none, each with its own rules and hooks.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { ArgsOf } from './index.ts'
import { defineApp, defineModel, master, memory, transaction } from './index.ts'

const M = { as: master }
const user = { as: asUser({ id: 'ada' }) }
const log: string[] = []
let creates = true
let updates = true

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		slug: f.string({ unique: true }),
		uses: f.number({ integer: true, default: 0 }),
		hidden: f.boolean({ default: false }),
		by: f.string({ optional: true }),
		notes: f.many(() => Note),
	}),
}).with({
	access: {
		read: ({ where }) => where({ hidden: false }),
		create: ({ value }) => {
			log.push(`create rule ${value.slug}`)
			return creates
		},
		update: ({ record, value }) => {
			log.push(`update rule ${record.uses} ${String(value.uses)}`)
			return updates
		},
	},
	hooks: {
		beforeCreate: ({ data, caller }) => {
			log.push('beforeCreate')
			if (caller.kind === 'user') data.by = caller.user.id
		},
		afterCreate: ({ record }) => {
			log.push(`afterCreate ${record.uses}`)
		},
		afterCreateCommit: () => {
			log.push('afterCreateCommit')
		},
		beforeUpdate: ({ record }) => {
			log.push(`beforeUpdate ${record.uses}`)
		},
		afterUpdate: ({ record, previous }) => {
			log.push(`afterUpdate ${previous.uses} ${record.uses}`)
		},
		afterUpdateCommit: () => {
			log.push('afterUpdateCommit')
		},
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string(), tag: f.one(() => Tag) }),
})

const news = {
	where: { slug: 'news' },
	create: { slug: 'news', uses: 1 },
	update: { uses: { increment: 1 } },
	select: { slug: true, uses: true },
} as const

describe('upsert', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		log.length = 0
		creates = true
		updates = true
		app = defineApp({ database: memory(), models: [Tag, Note] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('creates the row it does not find, with the create rules and hooks', async () => {
		const tag = await Tag.upsert(news, user)
		expect(tag).toStrictEqual({ slug: 'news', uses: 1 })
		expectTypeOf(tag).toEqualTypeOf<{
			readonly slug: string
			readonly uses: number
		}>()
		expect(log).toStrictEqual([
			'create rule news',
			'beforeCreate',
			'afterCreate 1',
			'afterCreateCommit',
		])
		expect(await Tag.findMany({ select: { by: true } }, M)).toStrictEqual([
			{ by: 'ada' },
		])
	})

	it('updates the row it finds, with the update rules and hooks', async () => {
		await Tag.create({ data: { slug: 'news', uses: 4 } }, M)
		log.length = 0
		expect(await Tag.upsert(news, user)).toStrictEqual({
			slug: 'news',
			uses: 5,
		})
		expect(log).toStrictEqual([
			'update rule 4 5',
			'beforeUpdate 4',
			'afterUpdate 4 5',
			'afterUpdateCommit',
		])
		expect(await Tag.count({}, M)).toBe(1)
	})

	it('refuses as the rule of the branch that runs', async () => {
		creates = false
		await expect(Tag.upsert(news, user)).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		creates = true
		updates = false
		await Tag.create({ data: { slug: 'news' } }, M)
		await expect(Tag.upsert(news, user)).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		expect(await Tag.findMany({ select: { uses: true } }, M)).toStrictEqual([
			{ uses: 0 },
		])
	})

	it('creates a row it cannot read, which its unique index refuses', async () => {
		await Tag.create({ data: { slug: 'news', hidden: true } }, M)
		log.length = 0
		await expect(Tag.upsert(news, user)).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
		})
		expect(log).toContain('beforeCreate')
		expect(log).not.toContain('beforeUpdate')
	})

	it('checks both data, whichever runs', async () => {
		const wrong = { ...news, update: { size: 1 } }
		// @ts-expect-error -- Tag has no size
		await expect(Tag.upsert(wrong, M)).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
		await Tag.create({ data: { slug: 'news' } }, M)
		const bad = { ...news, create: { slug: 'news', size: 1 } }
		// @ts-expect-error -- Tag has no size
		await expect(Tag.upsert(bad, M)).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
		expect(await Tag.count({}, M)).toBe(1)
	})

	it('takes a unique target, both data and nothing else', async () => {
		const { update: _, ...partial } = news
		// @ts-expect-error -- update is required
		await expect(Tag.upsert(partial, M)).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
		await expect(
			// @ts-expect-error -- uses is not unique
			Tag.upsert({ ...news, where: { uses: 1 } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		// @ts-expect-error -- an upsert has no data
		await expect(Tag.upsert({ ...news, data: {} }, M)).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
		expectTypeOf<ArgsOf<typeof Tag, 'upsert'>['create']>().toHaveProperty(
			'slug',
		)
	})

	it('writes relations in either branch, in a transaction', async () => {
		const note = { create: [{ text: 'first' }] }
		const args = {
			where: { slug: 'news' },
			create: { slug: 'news', notes: note },
			update: { notes: { create: [{ text: 'second' }] } },
			include: { notes: { select: { text: true } } },
		}
		const [made, kept] = await transaction(async () => [
			await Tag.upsert(args, M),
			await Tag.upsert(args, M),
		])
		expect(made?.notes).toStrictEqual([{ text: 'first' }])
		expect(kept?.notes).toStrictEqual([{ text: 'first' }, { text: 'second' }])
	})
})

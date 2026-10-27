// Reads fetch the fields they return (D-136), the whole row when a field
// read rule the caller runs may read any of it (D-44).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Adapter, Read } from './index.ts'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }

const Doc = defineModel({
	name: 'Doc',
	fields: (f) => ({
		title: f.string(),
		status: f.enumOf(['public', 'private']),
		secret: f.string().with<{ status: 'public' | 'private' }>({
			access: { read: ({ record }) => record.status === 'public' },
		}),
		owner: f.one(() => Owner),
	}),
}).with({ access: allow.readOnly })

const Owner = defineModel({
	name: 'Owner',
	fields: (f) => ({ name: f.string(), docs: f.many(() => Doc) }),
}).with({ access: allow.readOnly })

const reads: Read[] = []
let app: ReturnType<typeof defineApp>
const user = { as: asUser({ id: 'u' }) }

beforeEach(async () => {
	const database = memory()
	const spy: Adapter = {
		...database,
		find: async (read) => {
			reads.push(read)
			return database.find(read)
		},
	}
	app = defineApp({ database: spy, models: [Doc, Owner] })
	await app.start()
	const owner = await Owner.create({ data: { name: 'Ada' } }, M)
	for (const status of ['public', 'private'] as const) {
		await Doc.create(
			{
				data: {
					title: status,
					status,
					secret: 's',
					owner: { connect: { id: owner.id } },
				},
			},
			M,
		)
	}
	reads.length = 0
})
afterEach(async () => app.stop())

describe('a read (D-136)', () => {
	it('fetches only the fields it returns', async () => {
		const rows = await Doc.findMany(
			{ select: { title: true, owner: { select: { name: true } } } },
			user,
		)
		expect(rows).toEqual([
			{ title: 'public', owner: { name: 'Ada' } },
			{ title: 'private', owner: { name: 'Ada' } },
		])
		expect(reads[0]?.fields).toEqual(['id', 'title'])
		expect(reads[0]?.include?.['owner']?.fields).toEqual(['id', 'name'])
		await Doc.findMany({ omit: { status: true } }, M)
		expect(reads[1]?.fields).toEqual([
			'id',
			'createdAt',
			'updatedAt',
			'title',
			'secret',
		])
	})

	it('fetches the whole row when a field rule may read it', async () => {
		const rows = await Doc.findMany({ select: { secret: true } }, user)
		expect(rows).toEqual([{ secret: 's' }, {}])
		expect(reads[0]?.fields).toBeUndefined()
		await Doc.findMany({ select: { secret: true } }, M)
		expect(reads[1]?.fields).toEqual(['id', 'secret'])
	})
})

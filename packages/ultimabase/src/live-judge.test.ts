// A live read told which rows pass its rule (D-259): it takes the stored rows
// when they answer, and shares its read across callers when they do not.
import { asUser } from '@ultimabase/testing'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { Adapter, Row } from './index.ts'
import { allow, defineApp, defineModel, master, memory } from './index.ts'
import type { Judge } from './internal.ts'
import { liveReader, SharedReads, storedRows } from './internal.ts'

const M = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ name: f.string() }),
}).with({ access: allow.public })
/** A user reads the letters of the writer named as they are. */
const Letter = defineModel({
	name: 'Letter',
	fields: (f) => ({ text: f.string(), writer: f.one(() => Writer) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			(caller.kind === 'user' &&
				where({ writer: { is: { name: { equals: caller.user.id } } } })),
	},
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
const app = defineApp({ database: counted, models: [Writer, Letter] })

const ada = asUser({ id: 'ada' })
const bob = asUser({ id: 'bob' })
const plain = { select: { id: true, text: true } }
const joined = {
	select: { id: true, text: true, writer: { select: { name: true } } },
}

let hers = ''
let his = ''
let ids: readonly string[] = []
let rows: ReadonlyMap<string, Row> = new Map()

const verdict =
	(...passing: readonly string[]): Judge =>
	async () =>
		new Set(passing)
const unsure: Judge = async () => undefined

const letter = async (name: string): Promise<string> => {
	const { id } = await Writer.create({ data: { name } }, M)
	const data = { text: name, writer: { connect: { id } } }
	return (await Letter.create({ data }, M)).id
}

beforeAll(async () => {
	await app.start()
	hers = await letter('ada')
	his = await letter('bob')
	ids = [hers, his]
	const stored = await storedRows('Letter', {})
	rows = new Map(stored.map((row) => [row.id, row]))
})
afterAll(async () => app.stop())
beforeEach(() => {
	finds = []
})

it('takes the stored rows the judge lets through, with no read', async () => {
	const reader = await liveReader('Letter', plain, ada)
	const found = await reader(ids, rows, new SharedReads(), verdict(hers))
	expect(found).toEqual([{ id: hers, text: 'ada' }])
	expect(finds).toEqual([])
})

it('reads once for every caller when the judge is sure, each seeing its rows', async () => {
	const reads = new SharedReads()
	const hersRead = await liveReader('Letter', joined, ada)
	const hisRead = await liveReader('Letter', joined, bob)
	finds = []
	expect(await hersRead(ids, rows, reads, verdict(hers))).toEqual([
		{ id: hers, text: 'ada', writer: { name: 'ada' } },
	])
	expect(await hisRead(ids, rows, reads, verdict(his))).toEqual([
		{ id: his, text: 'bob', writer: { name: 'bob' } },
	])
	expect(finds.filter((model) => model === 'Letter')).toEqual(['Letter'])
})

it('asks the database per caller when the judge cannot tell', async () => {
	const reads = new SharedReads()
	const hersRead = await liveReader('Letter', plain, ada)
	const hisRead = await liveReader('Letter', plain, bob)
	finds = []
	expect(await hersRead(ids, rows, reads, unsure)).toEqual([
		{ id: hers, text: 'ada' },
	])
	expect(await hisRead(ids, rows, reads, unsure)).toEqual([
		{ id: his, text: 'bob' },
	])
	expect(finds.filter((model) => model === 'Letter')).toHaveLength(2)
})

it('checks the rule in the read without a judge', async () => {
	const reader = await liveReader('Letter', plain, ada)
	const expected = [{ id: hers, text: 'ada' }]
	expect(await reader(ids, rows, new SharedReads())).toEqual(expected)
	expect(await reader(ids, rows)).toEqual(expected)
	expect(await reader(ids)).toEqual(expected)
})

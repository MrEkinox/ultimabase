// `updateMany` writes rows whose data came out the same in one change, found
// by key rather than by a scan of the groups, so that a hook stamping each row
// keeps it linear (D-133, D-347).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Adapter, Change } from './adapter.ts'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
let stamp: (text: string) => Date = () => new Date(0)
const updates: Change[] = []

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		text: f.string(),
		done: f.boolean({ default: false }),
		at: f.dateTime({ optional: true }),
	}),
}).with({
	hooks: {
		beforeUpdate: ({ record, data }) => {
			data.at = stamp(record.text)
		},
	},
})

/** The memory adapter, keeping the update changes its transactions write. */
function counting(): Adapter {
	const base = memory()
	return {
		start: async (schema, logger) => base.start(schema, logger),
		stop: async () => base.stop(),
		empty: async () => base.empty(),
		find: async (read) => base.find(read),
		count: async (read) => base.count(read),
		aggregate: async (read) => base.aggregate(read),
		write: async (write) => base.write(write),
		begin: async () => {
			const tx = await base.begin()
			return {
				...tx,
				write: async (write) => {
					updates.push(
						...write.changes.filter((change) => change.kind === 'update'),
					)
					return tx.write(write)
				},
			}
		},
	}
}

const app = defineApp({ database: counting(), models: [Task] })
beforeEach(async () => {
	await app.start()
	for (const text of ['a', 'b', 'c']) await Task.create({ data: { text } }, M)
	updates.length = 0
})
afterEach(async () => app.stop())

const stored = async () =>
	(await Task.findMany({ orderBy: { text: 'asc' } }, M)).map((row) => [
		row.text,
		row.at?.getTime(),
	])

describe('updateMany with a hook that stamps each row', () => {
	it('writes rows given equal dates in one change', async () => {
		stamp = () => new Date(1000)
		expect(await Task.updateMany({ data: { done: true } }, M)).toEqual({
			count: 3,
		})
		expect(updates).toHaveLength(1)
		expect(await stored()).toEqual([
			['a', 1000],
			['b', 1000],
			['c', 1000],
		])
	})

	it('writes rows given different dates each with its own', async () => {
		stamp = (text) => new Date(text.charCodeAt(0))
		await Task.updateMany({ data: { done: true } }, M)
		expect(updates).toHaveLength(3)
		expect(await stored()).toEqual([
			['a', 97],
			['b', 98],
			['c', 99],
		])
	})
})

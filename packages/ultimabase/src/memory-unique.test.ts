// memory()'s unique check (D-347): the rows a write inserted or updated are
// tested against the others, a time compared by its value.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }

const Slot = defineModel({
	name: 'Slot',
	fields: (f) => ({
		at: f.dateTime({ unique: true }),
		room: f.string(),
		seat: f.number({ integer: true }),
	}),
	indexes: [{ fields: ['room', 'seat'], unique: true }],
})

describe('a unique check of memory()', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Slot] })
		await app.start()
		await Slot.create({ data: { at: new Date(0), room: 'A', seat: 1 } }, M)
	})
	afterEach(async () => app.stop())

	it('refuses a time another write stored', async () => {
		const data = { at: new Date(0), room: 'B', seat: 1 }
		await expect(Slot.create({ data }, M)).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
		})
	})

	it('takes a key whose first value alone another row holds', async () => {
		await Slot.create({ data: { at: new Date(1), room: 'A', seat: 2 } }, M)
		expect(await Slot.count({}, M)).toBe(2)
	})
})

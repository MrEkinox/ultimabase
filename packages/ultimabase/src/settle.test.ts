// A transaction ends once its queries settle (D-208): its ROLLBACK or COMMIT
// never runs beside a query still in it, as a database connection runs one
// statement at a time.
import { setTimeout } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Adapter, Logger } from './index.ts'
import {
	Conflict,
	defineApp,
	defineModel,
	master,
	memory,
	transaction,
} from './index.ts'

const M = { as: master }

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({ name: f.string() }),
})

const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}

/** What each find in a transaction does, in order; then it reads. */
const plan: ('slow' | 'fail' | 'conflict')[] = []
/** How each transaction ended, and how many of its queries still ran. */
const ends: { end: 'commit' | 'rollback'; busy: number }[] = []

/** `memory()`, its finds in a transaction following `plan`. */
function tracking(): Adapter {
	const base = memory()
	return {
		...base,
		begin: async (options) => {
			const tx = await base.begin(options)
			let busy = 0
			return {
				...tx,
				find: async (read) => {
					busy += 1
					try {
						const step = plan.shift()
						if (step === 'slow') await setTimeout(20)
						if (step === 'fail') throw new Error('The server went away.')
						if (step === 'conflict') throw new Conflict()
						return await tx.find(read)
					} finally {
						busy -= 1
					}
				},
				commit: async () => {
					ends.push({ end: 'commit', busy })
					await tx.commit()
				},
				rollback: async () => {
					ends.push({ end: 'rollback', busy })
					await tx.rollback()
				},
			}
		},
	}
}

let app: ReturnType<typeof defineApp>

beforeEach(async () => {
	plan.length = 0
	ends.length = 0
	app = defineApp({ database: tracking(), models: [Account], logger: silent })
	await app.start()
})
afterEach(async () => {
	await app.stop()
})

const read = async () => Account.findMany({}, M)

describe('a transaction (D-208)', () => {
	it('rolls back once the siblings of a failed query settle', async () => {
		plan.push('slow', 'fail')
		await expect(
			transaction(async () => Promise.all([read(), read()])),
		).rejects.toThrow('The server went away.')
		expect(ends).toEqual([{ end: 'rollback', busy: 0 }])
	})

	it('commits once a read the callback did not wait for settles', async () => {
		plan.push('slow')
		const left: Promise<unknown>[] = []
		await transaction(async () => {
			await Account.create({ data: { name: 'ada' } }, M)
			left.push(read())
		})
		expect(ends).toEqual([{ end: 'commit', busy: 0 }])
		expect(await Promise.all(left)).toMatchObject([[{ name: 'ada' }]])
	})

	it('rolls back when a read the callback did not wait for fails', async () => {
		plan.push('fail')
		const left: Promise<unknown>[] = []
		await expect(
			transaction(async () => {
				await Account.create({ data: { name: 'ada' } }, M)
				left.push(read().catch(() => undefined))
			}),
		).rejects.toThrow('The server went away.')
		await Promise.all(left)
		expect(ends).toEqual([{ end: 'rollback', busy: 0 }])
		expect(await Account.count({}, M)).toBe(0)
	})

	it('runs a serializable one again once a conflict’s siblings settle', async () => {
		plan.push('slow', 'conflict')
		const rows = await transaction(async () => Promise.all([read(), read()]), {
			isolation: 'serializable',
		})
		expect(rows).toEqual([[], []])
		expect(ends).toEqual([
			{ end: 'rollback', busy: 0 },
			{ end: 'commit', busy: 0 },
		])
	})
})

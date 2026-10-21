// Transactions (D-36, D-88): one operation, or one `transaction` callback,
// commits or rolls back as a whole; the `*Commit` hooks run after the commit.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Logger } from './index.ts'
import { defineApp, defineModel, master, memory, transaction } from './index.ts'

const M = { as: master }
const log: string[] = []

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({ name: f.string({ unique: true }) }),
}).with({
	hooks: {
		afterCreate: ({ record }) => {
			log.push(`after ${record.name}`)
		},
		afterCreateCommit: async ({ record }) => {
			log.push(`commit ${record.name}`)
			if (record.name !== 'ada') return
			// Outside the committed transaction: this write opens its own.
			await transaction(async () => {
				await Account.create({ data: { name: 'ada-2' } }, M)
			})
		},
	},
})

const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}
const started = () =>
	defineApp({ database: memory(), models: [Account], logger: silent })
let app: ReturnType<typeof started>

beforeEach(async () => {
	log.length = 0
	app = started()
	await app.start()
})
afterEach(async () => {
	await app.stop()
})

const create = async (name: string) => Account.create({ data: { name } }, M)
const names = async () =>
	(await Account.findMany({ orderBy: { name: 'asc' } }, M)).map(
		(row) => row.name,
	)

describe('transaction', () => {
	it('runs the commit hooks after the last write commits', async () => {
		await transaction(async () => {
			await create('bob')
			await create('cy')
			log.push('callback done')
		})
		expect(log).toEqual([
			'after bob',
			'after cy',
			'callback done',
			'commit bob',
			'commit cy',
		])
	})

	it('resolves with what the callback returns', async () => {
		expect(await transaction(async () => (await create('bob')).name)).toBe(
			'bob',
		)
	})

	it('reads its own writes', async () => {
		await transaction(async () => {
			await create('bob')
			expect(await names()).toEqual(['bob'])
		})
	})

	it('rolls every write back when the callback throws', async () => {
		const failed = transaction(async () => {
			await create('bob')
			throw new Error('Stop.')
		})
		await expect(failed).rejects.toThrow('Stop.')
		expect(await names()).toEqual([])
		expect(log).toEqual(['after bob'])
	})

	it('rejects with a failed query even when the callback catches it', async () => {
		const failed = transaction(async () => {
			await create('bob')
			await create('bob').catch(() => undefined)
			return 'done'
		})
		await expect(failed).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
		expect(await names()).toEqual([])
	})

	it('runs no query after a failed one (D-88)', async () => {
		const failed = transaction(async () => {
			await create('bob')
			await create('bob').catch(() => undefined)
			await create('cy')
		})
		await expect(failed).rejects.toThrow(
			'A query failed in this transaction, which rolls back: no other query runs in it.',
		)
		expect(await names()).toEqual([])
	})

	it('joins the outer one when nested: an inner failure rolls back both', async () => {
		const failed = transaction(async () => {
			await create('bob')
			await transaction(async () => {
				await create('cy')
			})
			await transaction(async () => {
				throw new Error('Inner.')
			}).catch(() => undefined)
			await create('dee')
		})
		await expect(failed).rejects.toThrow(
			'A query failed in this transaction, which rolls back',
		)
		expect(await names()).toEqual([])
		expect(log).not.toContain('commit bob')
	})

	it("opens a new one for a commit hook's queries", async () => {
		await create('ada')
		expect(await names()).toEqual(['ada', 'ada-2'])
		expect(log).toEqual([
			'after ada',
			'commit ada',
			'after ada-2',
			'commit ada-2',
		])
	})

	it('needs a started application', async () => {
		await app.stop()
		await expect(transaction(async () => 1)).rejects.toThrow(
			'transaction runs on a started application.',
		)
		await app.start()
	})
})

describe('a started application', () => {
	it('is the only one running', async () => {
		await expect(started().start()).rejects.toThrow(
			'An application is already running; stop it first.',
		)
	})
})

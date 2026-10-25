// Transactions (D-36, D-88): one operation, or one `transaction` callback,
// commits or rolls back as a whole; the `*Commit` hooks run after the commit.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Adapter, Logger } from './index.ts'
import {
	defineApp,
	defineModel,
	master,
	memory,
	RelationViolation,
	transaction,
} from './index.ts'

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

/** Refuses each write alone and each commit, as a foreign key that raced. */
function refusing(error: Error): Adapter {
	const base = memory()
	return {
		...base,
		write: async () => {
			throw error
		},
		begin: async () => {
			const tx = await base.begin()
			return {
				...tx,
				commit: async () => {
					await tx.rollback()
					throw error
				},
			}
		},
	}
}

async function restart(error: Error): Promise<void> {
	await app.stop()
	app = defineApp({ database: refusing(error), models: [Account] })
	await app.start()
}

describe('a relation the database refuses (D-99)', () => {
	it('reports a missing target as the connect check does', async () => {
		await restart(new RelationViolation('Account', 'team', 'Team', false))
		await expect(create('ada')).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Team does not exist.',
		})
	})

	it('reports a restricted delete at the commit as the cascade does', async () => {
		await restart(new RelationViolation('Account', 'team', 'Team', true))
		await expect(transaction(async () => create('ada'))).rejects.toMatchObject({
			code: 'RELATION_RESTRICTED',
			message: 'Account.team references a Team the delete removes.',
			details: { model: 'Account', field: 'team' },
		})
	})

	it('passes on any other refusal of the commit', async () => {
		await restart(new Error('The server went away.'))
		await expect(transaction(async () => create('ada'))).rejects.toThrow(
			'The server went away.',
		)
	})
})

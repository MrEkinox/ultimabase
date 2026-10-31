// A serializable transaction (D-179): a conflict runs `run` again, in a new
// transaction, 3 attempts at most; the `*Commit` hooks run once.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Adapter, BeginOptions, Logger } from './index.ts'
import {
	Conflict,
	defineApp,
	defineModel,
	master,
	memory,
	transaction,
} from './index.ts'

const M = { as: master }
const log: string[] = []

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({ name: f.string() }),
}).with({
	hooks: {
		afterCreateCommit: ({ record }) => {
			log.push(`commit ${record.name}`)
		},
	},
})

const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}

/** How many commits, and finds in a transaction, throw `Conflict`. */
const failing = { commits: 0, finds: 0 }
const begun: (BeginOptions | undefined)[] = []

/** `memory()`, each transaction failing as `failing` says. */
function conflicting(): Adapter {
	const base = memory()
	return {
		...base,
		begin: async (options) => {
			begun.push(options)
			const tx = await base.begin(options)
			return {
				...tx,
				find: async (read) => {
					if (failing.finds === 0) return tx.find(read)
					failing.finds -= 1
					throw new Conflict()
				},
				commit: async () => {
					if (failing.commits === 0) return tx.commit()
					failing.commits -= 1
					await tx.rollback()
					throw new Conflict()
				},
			}
		},
	}
}

let app: ReturnType<typeof defineApp>

beforeEach(async () => {
	log.length = 0
	begun.length = 0
	failing.commits = 0
	failing.finds = 0
	app = defineApp({
		database: conflicting(),
		models: [Account],
		logger: silent,
	})
	await app.start()
})
afterEach(async () => {
	await app.stop()
})

const serializable = { isolation: 'serializable' } as const
const conflict: unknown = expect.any(Conflict)
const names = async () => (await Account.findMany({}, M)).map((row) => row.name)

describe('a serializable transaction', () => {
	it('runs again on a conflict, its commit hooks once', async () => {
		failing.commits = 2
		let attempts = 0
		const result = await transaction(async () => {
			attempts += 1
			await Account.create({ data: { name: 'ada' } }, M)
			return attempts
		}, serializable)
		expect(result).toBe(3)
		expect(begun).toStrictEqual([serializable, serializable, serializable])
		expect(log).toStrictEqual(['commit ada'])
		expect(await names()).toStrictEqual(['ada'])
	})

	it('fails with CONFLICT after the third conflict, leaving nothing', async () => {
		failing.commits = 3
		let attempts = 0
		await expect(
			transaction(async () => {
				attempts += 1
				await Account.create({ data: { name: 'ada' } }, M)
			}, serializable),
		).rejects.toMatchObject({
			code: 'CONFLICT',
			message: 'This operation conflicted with another; try it again.',
			cause: conflict,
		})
		expect(attempts).toBe(3)
		expect(log).toStrictEqual([])
		expect(await names()).toStrictEqual([])
	})

	it('runs again on a conflict caught inside run', async () => {
		failing.finds = 2
		const outcomes: string[] = []
		const result = await transaction(async () => {
			try {
				return await Account.findMany({}, M)
			} catch (error) {
				outcomes.push(error instanceof Conflict ? 'conflict' : 'other')
				if (outcomes.length === 1) throw new Error('Wrapped.', { cause: error })
				return []
			}
		}, serializable)
		expect(result).toStrictEqual([])
		expect(outcomes).toStrictEqual(['conflict', 'conflict'])
		expect(begun).toHaveLength(3)
	})

	it('does not run again on any other error', async () => {
		let attempts = 0
		await expect(
			transaction(async () => {
				attempts += 1
				await Account.create({ data: { name: 'ada' } }, M)
				throw new Error('Refused.')
			}, serializable),
		).rejects.toThrow('Refused.')
		expect(attempts).toBe(1)
	})

	it('is joined by a nested transaction, with or without the option', async () => {
		await transaction(async () => {
			await transaction(async () =>
				Account.create({ data: { name: 'ada' } }, M),
			)
			await transaction(
				async () => Account.create({ data: { name: 'bob' } }, M),
				serializable,
			)
		}, serializable)
		expect(begun).toStrictEqual([serializable])
		expect((await names()).toSorted()).toStrictEqual(['ada', 'bob'])
	})
})

describe('a read committed transaction', () => {
	it('does not run again on a conflict', async () => {
		failing.commits = 1
		let attempts = 0
		const failed = transaction(async () => {
			attempts += 1
			await Account.create({ data: { name: 'ada' } }, M)
		})
		await expect(failed).rejects.toBeInstanceOf(Conflict)
		expect(attempts).toBe(1)
		expect(begun).toStrictEqual([undefined])
	})

	it('cannot become serializable once it began', async () => {
		await expect(
			transaction(async () => transaction(async () => undefined, serializable)),
		).rejects.toThrow(
			'A transaction cannot become serializable once it began; open the serializable transaction first.',
		)
	})
})

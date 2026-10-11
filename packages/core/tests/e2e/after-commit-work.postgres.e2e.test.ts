import { UltimaBase } from '@ultimabase/core'
import { runAfterCommit, waitForAfterCommitWork } from '@ultimabase/core/plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { createCapturingLogger } from '@ultimabase/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0318: work queued on a transaction runs after its commit, in order,
// outside the request, without delaying the response; failures are logged.
const Note = UltimaBase.Schema.define({
	className: 'AfterCommitWorkNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})

const trace: string[] = []
const logger = createCapturingLogger()
let fixture: PostgresWorkerFixture | undefined
let ultimabase: { dispose(): Promise<void> } | undefined
let transaction: <TResult>(fn: () => Promise<TResult>) => Promise<TResult> =
	() => Promise.reject(new TypeError('Application not started'))

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'after_commit_work' })
	const app = new (UltimaBase.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ logger, schemas: [Note] })
	ultimabase = app
	transaction = (fn) => app.transaction(fn)
	try {
		await app.start()
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await ultimabase?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

beforeEach(async () => {
	await waitForAfterCommitWork()
	trace.length = 0
	logger.clear()
})

describe('runAfterCommit', () => {
	it('runs queued work in order after commit, without delaying the response', async () => {
		let release: () => void = () => undefined
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		await transaction(async () => {
			await Note.createOne({ data: { body: 'queued' } })
			runAfterCommit(async () => {
				await held
				trace.push('first')
			})
			runAfterCommit(() => {
				trace.push('second')
			})
			trace.push('callback')
		})
		trace.push('answered')
		expect(trace).toStrictEqual(['callback', 'answered'])

		release()
		await waitForAfterCommitWork()
		expect(trace).toStrictEqual(['callback', 'answered', 'first', 'second'])
	})

	it('runs outside the transaction: the normal API starts its own request', async () => {
		await transaction(async () => {
			await Note.createOne({ data: { body: 'outer' } })
			runAfterCommit(async () => {
				await Note.createOne({ data: { body: 'after commit' } })
				trace.push('created')
			})
		})
		await waitForAfterCommitWork()
		expect(trace).toStrictEqual(['created'])
		await expect(
			Note.findOne({ where: { body: { eq: 'after commit' } } }),
		).resolves.not.toBeNull()
	})

	it('discards the work of a rolled-back transaction', async () => {
		await expect(
			transaction(() => {
				runAfterCommit(() => {
					trace.push('never')
				})
				return Promise.reject(new Error('rolled back'))
			}),
		).rejects.toThrow('rolled back')
		await waitForAfterCommitWork()
		expect(trace).toStrictEqual([])
	})

	it('logs a failure and still runs the next work', async () => {
		await transaction(() => {
			runAfterCommit(() => {
				throw new Error('after-commit failure')
			})
			runAfterCommit(() => {
				trace.push('next')
			})
			return Promise.resolve()
		})
		await waitForAfterCommitWork()
		expect(trace).toStrictEqual(['next'])
		expect(logger.messages('error')).toStrictEqual([
			'UltimaBase: after-commit work failed; the committed write is kept',
		])
	})

	it('requires an active transaction', () => {
		expect(() => {
			runAfterCommit(() => undefined)
		}).toThrow(expect.objectContaining({ code: 'TRANSACTION_ERROR' }))
	})
})

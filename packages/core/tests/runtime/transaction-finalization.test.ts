import {
	FrameworkApplication,
	Schema,
	stringField,
	type SchemaDefinition,
} from '../../src/index.js'
import {
	FrameworkEngine,
	RequestContext,
	RuntimePipeline,
	createRuntimeValidationStage,
	getCurrentEngine,
	requestSources,
	type RuntimePipelineStages,
} from '../../src/runtime/index.js'
import { createNativeHookStages } from '../../src/runtime/hooks/dispatcher.js'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type TransactionFailureOptions,
} from './fixtures/recording-database-adapter.js'

const fixedInstant = new Date('2026-08-02T12:00:00.000Z')
const generatedIds = [
	'0198f090-2a50-7000-8000-000000000101',
	'0198f090-2a50-7000-8000-000000000102',
] as const

/** Creates complete adapter records that match deterministic Runtime generation. */
const createRecord = (id: string, title: string) => ({
	createdAt: fixedInstant.toISOString(),
	id,
	title,
	updatedAt: fixedInstant.toISOString(),
})

/** Narrows heterogeneous transaction summaries without weakening hook contracts. */
const readResultTitle = (result: unknown): string => {
	if (!isPlainRecord(result) || typeof result.title !== 'string') {
		throw new TypeError('Expected a singular article result')
	}

	return result.title
}

/** Assembles the real native dispatcher around one deterministic fake adapter. */
const createRequest = async <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	results: readonly QueuedAdapterResult[],
	trace: string[],
	failures: TransactionFailureOptions = {},
) => {
	const adapter = new RecordingDatabaseAdapter(results, trace, failures)
	const application = new FrameworkApplication({
		plugins: [],
		schemas: [schema],
	})

	await application.start()
	const nativeHooks = createNativeHookStages(application)
	let generatedIdIndex = 0
	const stages: RuntimePipelineStages = {
		commit: () => undefined,
		databaseOperation: adapter,
		globalAfterHooks: ({ result }) => result,
		globalBeforeHooks: ({ operation }) => operation,
		nativeHooks,
		normalization: ({ operation }) => operation,
		postCommitEvents: ({ operation }) => {
			trace.push(`event:${operation.kind}`)
		},
		schemaAfterHooks: ({ result }) => result,
		schemaBeforeHooks: ({ operation }) => operation,
		structuralValidation: createRuntimeValidationStage({
			clock: () => fixedInstant,
			uuidV7Generator: () => {
				const id = generatedIds[generatedIdIndex]

				if (id === undefined) {
					throw new TypeError('Missing deterministic identifier fixture')
				}

				generatedIdIndex += 1

				return id
			},
		}),
	}
	const framework = new FrameworkEngine({
		application,
		pipeline: new RuntimePipeline(stages),
	})
	const request = framework.withContext(
		RequestContext.user('hook-user', {
			requestId: 'transaction-finalization',
			source: requestSources.internal,
		}),
	)

	return { adapter, application, request }
}

describe('native transaction hook finalization', () => {
	it('observes a read failure without manufacturing transaction state', async () => {
		const trace: string[] = []
		const readError = new Error('read failed')
		const schema = Schema.define({
			className: 'TransactionFinalizationReadFailure',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				onError: ({ error, phase, transaction }) => {
					expect(error).toBe(readError)
					trace.push(
						`error:${phase}:${transaction.status}:${transaction.rollback}`,
					)
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[{ error: readError, status: 'rejected' }],
			trace,
		)

		await expect(request.query(schema).find()).rejects.toBe(readError)
		expect(trace).toStrictEqual([
			'execute:find',
			'error:operation:not-started:not-applicable',
		])

		await application.dispose()
	})

	it('runs mutation finalizers only around a confirmed automatic commit', async () => {
		const trace: string[] = []
		const record = createRecord(generatedIds[0], 'Created')
		let capturedEngine: ReturnType<typeof getCurrentEngine> | undefined
		const schema = Schema.define({
			className: 'TransactionFinalizationSuccess',
			fields: {
				title: stringField({
					hooks: {
						afterCommit: ({ timing }) => {
							trace.push(`field:${timing}`)
						},
					},
					validation: { required: true },
				}),
			},
			hooks: {
				afterCommit: ({ result }) => {
					expect(() => capturedEngine?.query(schema)).toThrow(
						expect.objectContaining({ code: 'TRANSACTION_ERROR' }),
					)
					trace.push(`schema:afterCommit:${readResultTitle(result)}`)
				},
				beforeCreate: () => {
					capturedEngine = getCurrentEngine()
				},
				beforeCommit: ({ changes }) => {
					expect(Object.isFrozen(changes)).toBe(true)
					expect(Object.isFrozen(changes[0])).toBe(true)
					expect(Object.isFrozen(changes[0]?.operation)).toBe(true)
					expect(Object.isFrozen(changes[0]?.result)).toBe(true)
					trace.push(`schema:beforeCommit:${String(changes.length)}`)
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{
					materializations: [{ current: record, kind: 'create' }],
					status: 'fulfilled',
					value: record,
				},
			],
			trace,
		)

		const result = await request.query(schema).create({ title: 'Created' })

		expect(result).toBeInstanceOf(schema)
		expect(result.toJSON()).toStrictEqual(record)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'schema:beforeCommit:1',
			'adapter:commit',
			'field:after-commit',
			'schema:afterCommit:Created',
			'event:create-one',
		])

		await application.dispose()
	})

	it('keeps committed state visible when an after-commit observer fails', async () => {
		const trace: string[] = []
		const afterCommitError = new Error('after commit failed')
		const record = createRecord(generatedIds[0], 'Committed')
		const schema = Schema.define({
			className: 'TransactionFinalizationAfterCommitFailure',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				afterCommit: () => {
					trace.push('schema:afterCommit')
					throw afterCommitError
				},
				afterRollback: () => {
					trace.push('unexpected:afterRollback')
				},
				onError: ({ error, phase, transaction }) => {
					expect(error).toBe(afterCommitError)
					trace.push(`error:${phase}:${transaction.status}`)
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{
					materializations: [{ current: record, kind: 'create' }],
					status: 'fulfilled',
					value: record,
				},
			],
			trace,
		)

		await expect(
			request.query(schema).create({ title: 'Committed' }),
		).rejects.toBe(afterCommitError)
		expect(trace).toContain('adapter:commit')
		expect(trace).toContain('event:create-one')
		expect(trace).toContain('error:after-commit:committed')
		expect(trace).not.toContain('adapter:rollback')
		expect(trace).not.toContain('unexpected:afterRollback')

		await application.dispose()
	})

	it('summarizes multiple operations once in deterministic transaction order', async () => {
		const trace: string[] = []
		const first = createRecord(generatedIds[0], 'First')
		const second = createRecord(generatedIds[1], 'Second')
		const schema = Schema.define({
			className: 'TransactionFinalizationSummary',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				afterCommit: ({ result }) => {
					trace.push(`after:${readResultTitle(result)}`)
				},
				beforeCommit: ({ changes }) => {
					trace.push(
						`summary:${changes.map(({ result }) => readResultTitle(result)).join(',')}`,
					)
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{
					materializations: [{ current: first, kind: 'create' }],
					status: 'fulfilled',
					value: first,
				},
				{
					materializations: [{ current: second, kind: 'create' }],
					status: 'fulfilled',
					value: second,
				},
			],
			trace,
		)

		await request.transaction(async (transaction) => {
			await transaction.query(schema).create({ title: 'First' })
			await transaction.query(schema).create({ title: 'Second' })
		})
		expect(trace).toContain('summary:First,Second')
		expect(trace.indexOf('summary:First,Second')).toBeLessThan(
			trace.indexOf('adapter:commit'),
		)
		expect(trace.slice(-4)).toStrictEqual([
			'after:First',
			'after:Second',
			'event:create-one',
			'event:create-one',
		])

		await application.dispose()
	})

	it('reports a confirmed rollback without losing the original failure', async () => {
		const trace: string[] = []
		const beforeCommitError = new Error('before commit failed')
		const record = createRecord(generatedIds[0], 'Rejected')
		const schema = Schema.define({
			className: 'TransactionFinalizationRollback',
			fields: {
				title: stringField({
					hooks: {
						afterRollback: ({ timing }) => {
							trace.push(`field:${timing}`)
						},
						onError: ({ transaction }) => {
							trace.push(`field:error:${transaction.status}`)
						},
					},
					validation: { required: true },
				}),
			},
			hooks: {
				afterRollback: ({ error }) => {
					expect(error).toBe(beforeCommitError)
					trace.push('schema:afterRollback')
				},
				beforeCommit: () => {
					throw beforeCommitError
				},
				onError: ({ error, phase, transaction }) => {
					expect(error).toBe(beforeCommitError)
					trace.push(
						`schema:error:${phase}:${transaction.status}:${transaction.rollback}`,
					)
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{
					materializations: [{ current: record, kind: 'create' }],
					status: 'fulfilled',
					value: record,
				},
			],
			trace,
		)

		await expect(
			request.query(schema).create({ title: 'Rejected' }),
		).rejects.toBe(beforeCommitError)
		expect(trace.slice(-5)).toStrictEqual([
			'adapter:rollback',
			'field:after-rollback',
			'schema:afterRollback',
			'field:error:rolled-back',
			'schema:error:before-commit:rolled-back:succeeded',
		])

		await application.dispose()
	})

	it('does not claim rollback when commit and rollback both fail', async () => {
		const trace: string[] = []
		const commitError = new Error('commit failed')
		const rollbackError = new Error('rollback failed')
		const record = createRecord(generatedIds[0], 'Commit failure')
		const schema = Schema.define({
			className: 'TransactionFinalizationCommitFailure',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				afterRollback: () => {
					trace.push('unexpected:afterRollback')
				},
				onError: ({ error, phase, transaction }) => {
					expect(error).toBe(commitError)
					trace.push(
						`error:${phase}:${transaction.status}:${transaction.rollback}`,
					)
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{
					materializations: [{ current: record, kind: 'create' }],
					status: 'fulfilled',
					value: record,
				},
			],
			trace,
			{ commit: commitError, rollback: rollbackError },
		)

		await expect(
			request.query(schema).create({ title: 'Commit failure' }),
		).rejects.toEqual(
			new AggregateError(
				[commitError, rollbackError],
				'Transaction failed and rollback reported an additional error.',
				{ cause: rollbackError },
			),
		)
		expect(trace).toContain('error:commit:rollback-failed:failed')
		expect(trace).not.toContain('unexpected:afterRollback')

		await application.dispose()
	})
})

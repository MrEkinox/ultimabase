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
	requestSources,
	runWithRequestEngine,
	type RuntimePipelineStages,
} from '../../src/runtime/index.js'
import { createNativeHookStages } from '../../src/runtime/hooks/dispatcher.js'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
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

/** Reads the first successful title from a validated non-atomic summary. */
const readBulkResultTitle = (result: unknown): string => {
	if (
		!isPlainRecord(result) ||
		result.status !== 'stopped' ||
		!isUnknownArray(result.results)
	) {
		throw new TypeError('Expected a stopped bulk result')
	}

	return readResultTitle(result.results[0])
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
		RequestContext.anonymous({
			requestId: 'transaction-finalization',
			source: requestSources.internal,
		}),
	)

	return { adapter, application, request }
}

describe('native transaction hook finalization', () => {
	it('skips item lifecycle hooks when a where mutation matches no row', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'TransactionFinalizationMissingWhereTarget',
			fields: {
				title: stringField({
					indexed: 'unique',
					validation: { required: true },
				}),
			},
			hooks: {
				afterOperation: {
					delete: () => {
						trace.push('schema:afterDelete')
					},
					update: () => {
						trace.push('schema:afterUpdate')
					},
				},
				beforeOperation: {
					delete: () => {
						trace.push('schema:beforeDelete')
					},
					update: () => {
						trace.push('schema:beforeUpdate')
					},
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{ status: 'fulfilled', target: null, value: null },
				{ status: 'fulfilled', target: null, value: null },
			],
			trace,
		)

		await expect(
			runWithRequestEngine(request, () =>
				schema.updateOne({
					data: { title: 'Updated' },
					where: { title: { eq: 'Missing' } },
				}),
			),
		).resolves.toBeNull()
		await expect(
			runWithRequestEngine(request, () =>
				schema.deleteOne({ where: { title: { eq: 'Missing' } } }),
			),
		).resolves.toBeNull()
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:update-one',
			'execute:update-one',
			'adapter:commit',
			'event:update-one',
			'adapter:begin',
			'prepare:delete-one',
			'execute:delete-one',
			'adapter:commit',
			'event:delete-one',
		])

		await application.dispose()
	})

	it('runs mutation finalizers only around a confirmed automatic commit', async () => {
		const trace: string[] = []
		const record = createRecord(generatedIds[0], 'Created')
		const schema = Schema.define({
			className: 'TransactionFinalizationSuccess',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				transaction: {
					afterCommit: ({ changes }) => {
						expect(() => schema.findMany()).toThrow(
							expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
						)
						trace.push(
							`schema:afterCommit:${readResultTitle(changes[0]?.result)}`,
						)
					},
					beforeCommit: ({ changes }) => {
						expect(Object.isFrozen(changes)).toBe(true)
						expect(Object.isFrozen(changes[0])).toBe(true)
						expect(Object.isFrozen(changes[0]?.operation)).toBe(true)
						expect(Object.isFrozen(changes[0]?.result)).toBe(true)
						trace.push(`schema:beforeCommit:${String(changes.length)}`)
					},
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

		const result = await runWithRequestEngine(request, () =>
			schema.createOne({ data: { title: 'Created' } }),
		)

		expect(result).toBeInstanceOf(schema)
		expect(result.toJSON()).toStrictEqual(record)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'schema:beforeCommit:1',
			'adapter:commit',
			'schema:afterCommit:Created',
			'event:create-one',
		])

		await application.dispose()
	})

	it('finalizes a stopped non-atomic prefix only after its outer commit', async () => {
		const trace: string[] = []
		const writeError = new Error('second input failed')
		const first = createRecord(generatedIds[0], 'First')
		const schema = Schema.define({
			className: 'TransactionFinalizationPartialBulk',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				transaction: {
					afterCommit: ({ changes }) => {
						trace.push(
							`schema:afterCommit:${readBulkResultTitle(changes[0]?.result)}`,
						)
					},
					beforeCommit: ({ changes }) => {
						trace.push(
							`schema:beforeCommit:${readBulkResultTitle(changes[0]?.result)}`,
						)
					},
				},
			},
		})
		const { application, request } = await createRequest(
			schema,
			[
				{
					materializations: [{ current: first, kind: 'create' }],
					status: 'fulfilled',
					value: {
						error: writeError,
						failedIndex: 1,
						results: [first],
						status: 'stopped',
					},
				},
			],
			trace,
		)

		const result = await runWithRequestEngine(request, () =>
			schema.createMany(
				{ data: [{ title: 'First' }, { title: 'Second' }] },
				{
					atomic: false,
				},
			),
		)

		expect(result.status).toBe('stopped')
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-many',
			'execute:create-many',
			'schema:beforeCommit:First',
			'adapter:commit',
			'schema:afterCommit:First',
			'event:create-many',
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
				transaction: {
					afterCommit: () => {
						trace.push('schema:afterCommit')
						throw afterCommitError
					},
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
			runWithRequestEngine(request, () =>
				schema.createOne({ data: { title: 'Committed' } }),
			),
		).rejects.toBe(afterCommitError)
		expect(trace).toContain('adapter:commit')
		expect(trace).toContain('event:create-one')
		expect(trace).not.toContain('adapter:rollback')

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
				transaction: {
					afterCommit: ({ changes }) => {
						trace.push(
							`after:${changes.map(({ result }) => readResultTitle(result)).join(',')}`,
						)
					},
					beforeCommit: ({ changes }) => {
						trace.push(
							`summary:${changes.map(({ result }) => readResultTitle(result)).join(',')}`,
						)
					},
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

		await request.transaction(async () => {
			await schema.createOne({ data: { title: 'First' } })
			await schema.createOne({ data: { title: 'Second' } })
		})
		expect(trace).toContain('summary:First,Second')
		expect(trace.indexOf('summary:First,Second')).toBeLessThan(
			trace.indexOf('adapter:commit'),
		)
		expect(trace.slice(-3)).toStrictEqual([
			'after:First,Second',
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
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				transaction: {
					beforeCommit: () => {
						throw beforeCommitError
					},
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
			runWithRequestEngine(request, () =>
				schema.createOne({ data: { title: 'Rejected' } }),
			),
		).rejects.toBe(beforeCommitError)
		expect(trace.at(-1)).toBe('adapter:rollback')

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
			runWithRequestEngine(request, () =>
				schema.createOne({ data: { title: 'Commit failure' } }),
			),
		).rejects.toEqual(
			new AggregateError(
				[commitError, rollbackError],
				'Transaction failed and rollback reported an additional error.',
				{ cause: rollbackError },
			),
		)
		expect(trace).toContain('adapter:commit')
		expect(trace).toContain('adapter:rollback')

		await application.dispose()
	})
})

import {
	FrameworkApplication,
	Schema,
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
		globalBeforeHooks: () => undefined,
		nativeHooks,
		normalization: ({ operation }) => operation,
		postCommitEvents: ({ operation }) => {
			trace.push(`event:${operation.kind}`)
		},
		schemaAfterHooks: ({ result }) => result,
		schemaBeforeHooks: () => undefined,
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
			fields: (field) => ({
				title: field.string({
					indexed: 'unique',
					validation: { required: true },
				}),
			}),
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

	it('does not claim rollback when commit and rollback both fail', async () => {
		const trace: string[] = []
		const commitError = new Error('commit failed')
		const rollbackError = new Error('rollback failed')
		const record = createRecord(generatedIds[0], 'Commit failure')
		const schema = Schema.define({
			className: 'TransactionFinalizationCommitFailure',
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
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

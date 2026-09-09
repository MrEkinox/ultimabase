import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../../query/index.js'
import { Schema, SchemaRegistry } from '../../schema/index.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { databasePersistencePlanCapability } from '../database/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { bindRuntimeVirtualFields } from './binding.js'

const context = RequestContext.anonymous({
	requestId: 'virtual-scheduler',
	source: requestSources.internal,
})

const createPipeline = (
	records: readonly Readonly<Record<string, unknown>>[],
): RuntimePipeline => {
	const executor: DatabaseOperationExecutor = {
		capabilities: { persistencePlans: databasePersistencePlanCapability },
		execute: <const TOperation extends DatabaseOperationAst>(
			request: DatabaseOperationRequest<TOperation>,
		): Promise<DatabaseOperationResult<TOperation>> => {
			const fields = request.plan.returning.selection.fields.map(
				({ field }) => field,
			)
			const result = immutableArray(
				records.map((record) =>
					immutableRecord(
						Object.fromEntries(fields.map((field) => [field, record[field]])),
					),
				),
			)
			return Promise.resolve(result as DatabaseOperationResult<TOperation>)
		},
	}
	const pipeline = new RuntimePipeline({
		databaseOperation: executor,
		normalization: ({ operation }) => operation,
		structuralValidation: ({ operation }) => operation,
		finalMutationValidation: ({ operation }) => operation,
		commit: () => undefined,
	})
	bindRuntimeVirtualFields(pipeline, Object.freeze({}))
	return pipeline
}

const createRecords = (idSegment: string) =>
	immutableArray(
		Array.from({ length: 17 }, (_, value) =>
			immutableRecord({
				id: `0199f090-2a50-7000-${idSegment}-${String(value).padStart(12, '0')}`,
				value,
			}),
		),
	)

describe('Runtime virtual field scheduler', () => {
	it('runs collection resolvers in deterministic batches of sixteen', async () => {
		let active = 0
		let maximumActive = 0
		const starts: string[] = []
		const Collection = Schema.define({
			className: 'VirtualRuntimeCollection',
			fields: (field) => ({
				value: field.int({ required: true }),
				first: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: async ({ item }) => {
						const value = Number(Reflect.get(item, 'value'))
						starts.push(`${String(value)}:first`)
						active += 1
						maximumActive = Math.max(maximumActive, active)
						await new Promise<void>((resolve) => setTimeout(resolve, 2))
						active -= 1
						return value
					},
				}),
				second: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: async ({ item }) => {
						const value = Number(Reflect.get(item, 'value'))
						starts.push(`${String(value)}:second`)
						active += 1
						maximumActive = Math.max(maximumActive, active)
						await new Promise<void>((resolve) => setTimeout(resolve, 1))
						active -= 1
						return value * 2
					},
				}),
			}),
		})
		new SchemaRegistry([Collection]).resolveSchemaTargets()
		const result = await createPipeline(createRecords('8000')).execute({
			context,
			operation: immutableRecord({
				kind: 'find-many' as const,
				query: new QueryBuilder(Collection).select({
					first: true,
					second: true,
				}).ast,
			}),
		})

		expect(maximumActive).toBe(16)
		expect(starts).toStrictEqual(
			Array.from({ length: 17 }, (_, index) => [
				`${String(index)}:first`,
				`${String(index)}:second`,
			]).flat(),
		)
		expect(result.map((item) => item.second)).toStrictEqual(
			Array.from({ length: 17 }, (_, index) => index * 2),
		)
	})

	it('selects the lowest failing ordinal and starts no later batch', async () => {
		const started: number[] = []
		const Failure = Schema.define({
			className: 'VirtualRuntimeFailure',
			fields: (field) => ({
				value: field.int({ required: true }),
				computed: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: async ({ item }) => {
						const value = Number(Reflect.get(item, 'value'))
						started.push(value)
						if (value === 2) {
							await Promise.resolve()
							throw new Error('lowest')
						}
						if (value === 5) throw new Error('later')
						return value
					},
				}),
			}),
		})
		new SchemaRegistry([Failure]).resolveSchemaTargets()

		await expect(
			createPipeline(createRecords('8001')).execute({
				context,
				operation: immutableRecord({
					kind: 'find-many' as const,
					query: new QueryBuilder(Failure).select({ computed: true }).ast,
				}),
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: { field: 'computed', ordinal: 2 },
			publicMessage: 'The operation could not be completed.',
		})
		expect(started).toStrictEqual(
			Array.from({ length: 16 }, (_, index) => index),
		)
	})

	it('settles a cancelled batch and starts no later resolver', async () => {
		const controller = new AbortController()
		const started: number[] = []
		const Cancelled = Schema.define({
			className: 'VirtualRuntimeCancelled',
			fields: (field) => ({
				value: field.int({ required: true }),
				computed: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: async ({ item }) => {
						const value = Number(Reflect.get(item, 'value'))
						started.push(value)
						if (started.length === 16) controller.abort()
						await Promise.resolve()
						return value
					},
				}),
			}),
		})
		new SchemaRegistry([Cancelled]).resolveSchemaTargets()
		const cancelled = RequestContext.anonymous({
			requestId: 'virtual-runtime-cancelled-batch',
			signal: controller.signal,
			source: requestSources.internal,
		})

		await expect(
			createPipeline(createRecords('8002')).execute({
				context: cancelled,
				operation: immutableRecord({
					kind: 'find-many' as const,
					query: new QueryBuilder(Cancelled).select({ computed: true }).ast,
				}),
			}),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(started).toStrictEqual(
			Array.from({ length: 16 }, (_, index) => index),
		)
	})
})

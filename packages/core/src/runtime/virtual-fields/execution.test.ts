import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	readApplicationPluginOwner,
	runWithApplicationPluginOwner,
} from '../../plugins/callback-execution.js'
import {
	createApplication,
	plugin as createPlugin,
	contributeDeclarations,
} from '../../index.js'
import { QueryBuilder, type ExecutableOperationAst } from '../../query/index.js'
import { Pointer, Schema, SchemaRegistry } from '../../schema/index.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	PreparedDatabaseOperationExecution,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import {
	databaseInclusionCapability,
	databasePersistencePlanCapability,
	databasePointerCapability,
} from '../database/contracts.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import type { RuntimePipelineStages } from '../pipeline/contracts.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { bindRuntimeVirtualFields } from './binding.js'

const context = RequestContext.anonymous({
	requestId: 'virtual-runtime',
	source: requestSources.internal,
})

const createStages = (
	databaseOperation: DatabaseOperationExecutor,
	commit: () => void = () => undefined,
	overrides: Partial<RuntimePipelineStages> = {},
): RuntimePipelineStages => ({
	normalization: ({ operation }) => operation,
	structuralValidation: ({ operation }) => operation,
	finalMutationValidation: ({ operation }) => operation,
	databaseOperation,
	commit,
	...overrides,
})

const createPipeline = (
	databaseOperation: DatabaseOperationExecutor,
	commit?: () => void,
	overrides?: Partial<RuntimePipelineStages>,
): Readonly<{
	readonly application: object
	readonly pipeline: RuntimePipeline
}> => {
	const application = Object.freeze({})
	const pipeline = new RuntimePipeline(
		createStages(databaseOperation, commit, overrides),
	)
	bindRuntimeVirtualFields(pipeline, application)
	return immutableRecord({ application, pipeline })
}

const projectRecord = (
	record: Readonly<Record<string, unknown>>,
	request: DatabaseOperationRequest,
): Readonly<Record<string, unknown>> => {
	if (request.plan.returning.selection.fields.length === 0) return record
	return immutableRecord(
		Object.fromEntries(
			request.plan.returning.selection.fields.map(({ field }) => [
				field,
				record[field],
			]),
		),
	)
}

const createReadExecutor = (
	records: readonly Readonly<Record<string, unknown>>[],
	requests: DatabaseOperationRequest[] = [],
): DatabaseOperationExecutor => ({
	capabilities: { persistencePlans: databasePersistencePlanCapability },
	execute: <const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> => {
		requests.push(request)
		const projected = immutableArray(
			records.map((record) => projectRecord(record, request)),
		)
		const result: unknown =
			request.operation.kind === 'find-many'
				? projected
				: (projected[0] ?? null)
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	},
})

describe('Runtime virtual fields', () => {
	it('keeps dependencies private and supplies the exact request context', async () => {
		let resolverItem: Readonly<Record<string, unknown>> | undefined
		let resolverContext: RequestContext | undefined
		let resolverOwner: unknown
		const User = Schema.define({
			className: 'VirtualRuntimeUser',
			fields: (field) => ({
				firstName: field.string({ required: true }),
				lastName: field.string({ required: true }),
				secret: field.string({ required: true }),
				displayName: field.virtual({
					output: (output) => output.string({ nullable: false }),
					select: { firstName: true, lastName: true },
					resolve: ({ item, context: requestContext }) => {
						resolverItem = item
						resolverContext = requestContext
						resolverOwner = readApplicationPluginOwner(application)
						return `${String(Reflect.get(item, 'firstName'))} ${String(Reflect.get(item, 'lastName'))}`
					},
				}),
			}),
		})
		new SchemaRegistry([User]).resolveSchemaTargets()
		const requests: DatabaseOperationRequest[] = []
		let publicDatabaseResult: unknown
		const executor = createReadExecutor(
			[
				immutableRecord({
					firstName: 'Ada',
					id: '0199f090-2a50-7000-8000-000000000001',
					lastName: 'Lovelace',
					secret: 'analytical-engine',
				}),
			],
			requests,
		)
		const { application, pipeline } = createPipeline(executor, undefined, {
			behaviors: {
				transformDatabaseResult: (input) => {
					publicDatabaseResult = input.result
					return input.result
				},
			},
		})
		const operation = immutableRecord({
			kind: 'find-one' as const,
			query: new QueryBuilder(User).select({ displayName: true }).ast,
		})

		const result = await runWithApplicationPluginOwner(
			application,
			{ pluginId: 'fixture.outer-plugin' },
			() => pipeline.execute({ context, operation }),
		)

		expect(requests[0]?.operation).toBe(operation)
		expect(
			requests[0]?.plan.returning.selection.fields.map(({ field }) => field),
		).toStrictEqual(['firstName', 'lastName', 'id'])
		expect(publicDatabaseResult).toStrictEqual({
			id: '0199f090-2a50-7000-8000-000000000001',
		})
		expect(result).toStrictEqual({
			displayName: 'Ada Lovelace',
			id: '0199f090-2a50-7000-8000-000000000001',
		})
		expect(resolverContext).toBe(context)
		expect(resolverItem).toStrictEqual({
			firstName: 'Ada',
			id: '0199f090-2a50-7000-8000-000000000001',
			lastName: 'Lovelace',
		})
		expect(Object.isFrozen(resolverItem)).toBe(true)
		expect(resolverOwner).toBeUndefined()
	})

	it('attributes a plugin-owned schema resolver to its exact instance', async () => {
		let owner: unknown
		const Audit = Schema.define({
			className: 'VirtualPluginAudit',
			fields: (field) => ({
				message: field.string({ required: true }),
				label: field.virtual({
					output: (output) => output.string({ nullable: false }),
					select: { message: true },
					resolve: ({ item }) => {
						owner = readApplicationPluginOwner(compiled)
						return String(Reflect.get(item, 'message')).toUpperCase()
					},
				}),
			}),
		})
		const provider = createPlugin({
			core: '^0.0.0',
			instanceId: 'primary',
			id: 'fixture.virtual-schema',
			permissions: {
				'schema:declare': 'Provides a virtual audit schema for attribution.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({ contributionId: 'audit', schema: Audit })

						return undefined
					},
				}),
			],
		})
		const compiled = await createApplication({
			plugins: [provider],
			schemas: [],
		})
		const pipeline = new RuntimePipeline(
			createStages(
				createReadExecutor([
					immutableRecord({
						id: '0199f090-2a50-7000-8000-000000000005',
						message: 'owned',
					}),
				]),
			),
		)
		bindRuntimeVirtualFields(pipeline, compiled)

		await expect(
			pipeline.execute({
				context,
				operation: immutableRecord({
					kind: 'find-one' as const,
					query: new QueryBuilder(Audit).select({ label: true }).ast,
				}),
			}),
		).resolves.toMatchObject({ label: 'OWNED' })
		expect(owner).toStrictEqual({
			instanceId: 'primary',
			pluginId: 'fixture.virtual-schema',
		})
		await compiled.dispose()
	})

	it('honors complete and excluded virtual selections', async () => {
		let resolutions = 0
		const Entry = Schema.define({
			className: 'VirtualSelectionEntry',
			fields: (field) => ({
				label: field.string({ required: true }),
				summary: field.virtual({
					output: (output) => output.string({ nullable: false }),
					select: { label: true },
					resolve: ({ item }) => {
						resolutions += 1
						return String(Reflect.get(item, 'label')).toUpperCase()
					},
				}),
			}),
		})
		new SchemaRegistry([Entry]).resolveSchemaTargets()
		const executor = createReadExecutor([
			immutableRecord({
				createdAt: '2026-09-09T00:00:00.000Z',
				id: '0199f090-2a50-7000-8000-000000000002',
				label: 'complete',
				updatedAt: '2026-09-09T00:00:00.000Z',
			}),
		])
		const { pipeline } = createPipeline(executor)

		const complete = await pipeline.execute({
			context,
			operation: immutableRecord({
				kind: 'find-one' as const,
				query: new QueryBuilder(Entry).ast,
			}),
		})
		const excluded = await pipeline.execute({
			context,
			operation: immutableRecord({
				kind: 'find-one' as const,
				query: new QueryBuilder(Entry).select({ summary: false }).ast,
			}),
		})

		expect(complete).toHaveProperty('summary', 'COMPLETE')
		expect(excluded).not.toHaveProperty('summary')
		expect(resolutions).toBe(1)
	})

	it('resolves eager pointer and relation targets from independent private views', async () => {
		const Target = Schema.define({
			className: 'VirtualIncludedTarget',
			fields: (field) => ({
				name: field.string({ required: true }),
				secret: field.string({ required: true }),
				label: field.virtual({
					output: (output) => output.string({ nullable: false }),
					select: { name: true },
					resolve: ({ item }) =>
						String(Reflect.get(item, 'name')).toUpperCase(),
				}),
			}),
		})
		const Source = Schema.define({
			className: 'VirtualIncludedSource',
			fields: (field) => ({
				author: field.pointer({ target: 'VirtualIncludedTarget' }),
				reviewers: field.relation({ target: 'VirtualIncludedTarget' }),
			}),
		})
		new SchemaRegistry([Target, Source]).resolveSchemaTargets()
		const targetId = '0199f090-2a50-7000-8000-000000000011'
		const source = immutableRecord({
			author: new Pointer(Target, targetId),
			createdAt: '2026-09-09T00:00:00.000Z',
			id: '0199f090-2a50-7000-8000-000000000010',
			updatedAt: '2026-09-09T00:00:00.000Z',
		})
		const author = immutableRecord({
			id: targetId,
			name: 'Ada',
		})
		const reviewer = immutableRecord({
			id: '0199f090-2a50-7000-8000-000000000012',
			name: 'Grace',
		})
		let rootRequest: DatabaseOperationRequest | undefined
		const executor: DatabaseOperationExecutor = {
			capabilities: {
				inclusions: databaseInclusionCapability,
				persistencePlans: databasePersistencePlanCapability,
				pointers: databasePointerCapability,
			},
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => {
				rootRequest = request
				return Promise.resolve(
					projectRecord(source, request) as DatabaseOperationResult<TOperation>,
				)
			},
			readIncludedValue: (_record, fieldPath) =>
				fieldPath[0] === 'author' ? author : immutableArray([reviewer]),
		}
		const { pipeline } = createPipeline(executor)
		const operation = immutableRecord({
			kind: 'find-one' as const,
			query: new QueryBuilder(Source)
				.include('author', (query) => query.select({ label: true }))
				.include('reviewers', (query) => query.select({ label: true })).ast,
		})

		const result = await pipeline.execute({ context, operation })

		expect(result).toStrictEqual({
			author: { id: targetId, label: 'ADA' },
			createdAt: '2026-09-09T00:00:00.000Z',
			id: '0199f090-2a50-7000-8000-000000000010',
			reviewers: [
				{
					id: '0199f090-2a50-7000-8000-000000000012',
					label: 'GRACE',
				},
			],
			updatedAt: '2026-09-09T00:00:00.000Z',
		})
		for (const inclusion of rootRequest?.inclusions ?? []) {
			expect(
				inclusion.request.plan.returning.selection.fields.map(
					({ field }) => field,
				),
			).toStrictEqual(['name', 'id'])
		}
	})

	it('rejects invalid output before commit and preserves cancellation', async () => {
		const controller = new AbortController()
		let commits = 0
		const Invalid = Schema.define({
			className: 'VirtualRuntimeInvalid',
			fields: (field) => ({
				value: field.int({ required: true }),
				computed: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: () => 'invalid' as never,
				}),
			}),
		})
		new SchemaRegistry([Invalid]).resolveSchemaTargets()
		const executor = createReadExecutor([
			immutableRecord({
				id: '0199f090-2a50-7000-8000-000000000003',
				value: 1,
			}),
		])
		const { pipeline } = createPipeline(executor, () => {
			commits += 1
		})
		const operation = immutableRecord({
			kind: 'find-one' as const,
			query: new QueryBuilder(Invalid).select({ computed: true }).ast,
		})

		await expect(
			pipeline.execute({ context, operation }),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicMessage: 'The operation result is invalid.',
		})
		expect(commits).toBe(0)

		controller.abort()
		const cancelled = RequestContext.anonymous({
			requestId: 'virtual-runtime-cancelled',
			signal: controller.signal,
			source: requestSources.internal,
		})
		await expect(
			pipeline.execute({ context: cancelled, operation }),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
	})

	it('resolves mutation outputs before the commit stage', async () => {
		const trace: string[] = []
		const Mutation = Schema.define({
			className: 'VirtualRuntimeMutation',
			fields: (field) => ({
				value: field.int({ required: true }),
				doubled: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: ({ item }) => {
						trace.push('virtual')
						return Number(Reflect.get(item, 'value')) * 2
					},
				}),
			}),
		})
		new SchemaRegistry([Mutation]).resolveSchemaTargets()
		const stored = immutableRecord({
			id: '0199f090-2a50-7000-8000-000000000020',
			value: 3,
		})
		const transaction: DatabaseTransactionAdapter = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> =>
				Promise.resolve({
					execute: (
						executionRequest?: PreparedDatabaseOperationExecution<TOperation>,
					) => {
						trace.push('database')
						const result = projectRecord(stored, executionRequest ?? request)
						return Promise.resolve({
							materializations: [{ current: stored, kind: 'create' as const }],
							result,
						}) as ReturnType<PreparedDatabaseOperation<TOperation>['execute']>
					},
					target: null,
				} as unknown as PreparedDatabaseOperation<TOperation>),
			execute: <const TOperation extends DatabaseOperationAst>(): Promise<
				DatabaseOperationResult<TOperation>
			> =>
				Promise.reject(new TypeError('Unexpected direct mutation execution')),
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const { pipeline } = createPipeline(transaction, () => {
			trace.push('commit')
		})
		const operation = immutableRecord({
			input: immutableRecord({ value: 3 }),
			kind: 'create-one' as const,
			schema: new QueryBuilder(Mutation).ast.schema,
			selection: new QueryBuilder(Mutation).select({ doubled: true }).ast
				.selection,
		})

		await expect(
			pipeline.execute({ context, operation }),
		).resolves.toStrictEqual({
			doubled: 6,
			id: stored.id,
		})
		expect(trace).toStrictEqual(['database', 'virtual', 'commit'])
	})

	it('rejects recursive resolution through the shared callback boundary', async () => {
		const Recursive = Schema.define({
			className: 'VirtualRuntimeRecursive',
			fields: (field) => ({
				value: field.int({ required: true }),
				recursive: field.virtual({
					output: (output) => output.int({ nullable: false }),
					select: { value: true },
					resolve: async () => {
						await runtime.pipeline.execute({
							context,
							operation: nestedOperation,
						})
						return 1
					},
				}),
			}),
		})
		new SchemaRegistry([Recursive]).resolveSchemaTargets()
		const nestedOperation: ExecutableOperationAst = immutableRecord({
			kind: 'find-one' as const,
			query: new QueryBuilder(Recursive).select({ recursive: true }).ast,
		})
		const runtime = createPipeline(
			createReadExecutor([
				immutableRecord({
					id: '0199f090-2a50-7000-8000-000000000004',
					value: 1,
				}),
			]),
		)

		await expect(
			runtime.pipeline.execute({ context, operation: nestedOperation }),
		).rejects.toMatchObject({ code: 'RUNTIME_CALLBACK_RECURSION' })
	})
})

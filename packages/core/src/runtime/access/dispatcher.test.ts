import { createApplication, definePlugin } from '../../foundation.js'
import {
	Query,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type FindOperationAst,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
} from '../../query/index.js'
import {
	Schema,
	booleanField,
	relationField,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it, vi } from 'vitest'

import { createEnforcementStages } from '../enforcement/dispatcher.js'
import {
	RequestContext,
	createTrustedMasterRequestContext,
	requestSources,
} from '../context/request-context.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'

const accessTrace: string[] = []
const articleSchema = Schema.define({
	className: 'NativeAccessArticle',
	access: {
		filter: {
			read: ({ filter }) => filter.equalTo('published', true),
			update: ({ filter }) => filter.equalTo('published', true),
		},
		item: {
			update: ({ input, item }) =>
				input.title === 'Changed' && item.published === true,
		},
		operation: {
			read: {
				count: false,
				exists: true,
				many: ({ kind }) => {
					accessTrace.push(kind)
					return true
				},
				one: true,
			},
			update: true,
		},
	},
	fields: {
		published: booleanField(),
		secret: stringField({
			access: {
				create: false,
				read: {
					filter: false,
					item: ({ value }) => value !== 'hidden',
					order: false,
				},
				update: false,
			},
		}),
		title: stringField({ validation: { required: true } }),
	},
})

const context = RequestContext.anonymous({
	requestId: 'native-access-runtime',
	source: requestSources.internal,
})

const requireStages = (
	stages: RuntimeEnforcementStages | undefined,
): RuntimeEnforcementStages => {
	if (stages === undefined) {
		throw new TypeError('Native Access stages are required')
	}

	return stages
}

const createFind = (
	query: Query<typeof articleSchema> = new Query(articleSchema),
): FindOperationAst<typeof articleSchema> => ({
	kind: 'find',
	query: query.ast,
})

describe('NativeAccessRuntime', () => {
	it('never materializes relation handles when field Access narrows select-all', async () => {
		const target = Schema.define({
			className: 'NativeAccessSelectionTarget',
			fields: { label: stringField() },
		})
		const source = Schema.define({
			className: 'NativeAccessSelectionSource',
			fields: {
				denied: stringField({ access: { read: false } }),
				targets: relationField({ target: () => target }),
				title: stringField(),
			},
		})
		const application = await createApplication({
			schemas: [source, target],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = {
			kind: 'find',
			query: new Query(source).ast,
		} as const
		const enforcement = await stages.evaluate({ context, operation })
		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})
		const selected = enforced.operation.query.selection.fields.map(
			({ field }) => field,
		)

		expect(selected).toContain('title')
		expect(selected).not.toContain('denied')
		expect(selected).not.toContain('targets')
		await application.dispose()
	})

	it('dispatches exact read kinds and keeps row filters outside the Query AST', async () => {
		accessTrace.length = 0
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation = createFind(
			new Query(articleSchema).where((where) => where.eq('title', 'Public')),
		)
		const originalQuery = operation.query
		const enforcement = await stages.evaluate({ context, operation })
		const enforced = await stages.enforceOperation({
			context,
			enforcement,
			operation,
		})

		expect(accessTrace).toStrictEqual(['find'])
		expect(enforced.operation.query.where).toBe(originalQuery.where)
		expect(enforced.rowFilter).toMatchObject({
			field: 'published',
			kind: 'equal',
			value: true,
		})
		await application.dispose()
	})

	it('denies operation and indirect field disclosure before database work', async () => {
		const selectionSchema = Schema.define({
			className: 'NativeAccessBulkSelection',
			fields: {
				denied: stringField({ access: { read: false } }),
				title: stringField(),
			},
		})
		const application = await createApplication({
			schemas: [articleSchema, selectionSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const count = {
			kind: 'count',
			query: new Query(articleSchema).ast,
		} as const

		await expect(
			stages.evaluate({ context, operation: count }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			stages.evaluate({
				context,
				operation: createFind(
					new Query(articleSchema).where((where) =>
						where.eq('secret', 'guess'),
					),
				),
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			stages.evaluate({
				context,
				operation: createFind(new Query(articleSchema).ascending('secret')),
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		const selectedBulkCreate: CreateManyOperationAst<
			typeof selectionSchema,
			true,
			'denied'
		> = {
			inputs: [{ title: 'Allowed input' }],
			kind: 'create-many',
			options: { atomic: true },
			selection: new Query(selectionSchema).select({ denied: true }).ast
				.selection,
			schema: new Query(selectionSchema).ast.schema,
		}
		await expect(
			stages.evaluate({ context, operation: selectedBulkCreate }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await application.dispose()
	})

	it('rejects forbidden mutation input and set-based item callbacks', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const create: CreateOneOperationAst<typeof articleSchema> = {
			input: { secret: 'private', title: 'Draft' },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new Query(articleSchema).ast.schema,
		}
		const updateMany: UpdateManyOperationAst<typeof articleSchema> = {
			kind: 'update-many',
			query: new Query(articleSchema).ast,
			update: {
				kind: 'update-expression',
				operations: [{ field: 'title', kind: 'set', value: 'Changed' }],
			},
		}

		await expect(
			stages.evaluate({ context, operation: create }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(
			stages.evaluate({ context, operation: updateMany }),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'native-access-itemized-terminal-required',
			},
		})
		await application.dispose()
	})

	it('checks singular prepared targets and removes value-dependent output fields', async () => {
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: UpdateOneOperationAst<typeof articleSchema> = {
			kind: 'update-one',
			query: new Query(articleSchema).ast,
			update: {
				kind: 'update-expression',
				operations: [{ field: 'title', kind: 'set', value: 'Changed' }],
			},
		}

		await expect(
			stages.enforcePreparedMutation?.({
				context,
				operation,
				target: {
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000001',
					published: false,
					secret: 'hidden',
					title: 'Draft',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			}),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const find = createFind()
		const enforcement = await stages.evaluate({ context, operation: find })
		const result = await stages.enforceSelectionResult({
			context,
			enforcement,
			operation: find,
			result: [
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000010',
					published: true,
					secret: 'hidden',
					title: 'Private',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000011',
					published: true,
					secret: 'visible',
					title: 'Public',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			],
		})

		expect(result).toStrictEqual([
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000010',
				published: true,
				title: 'Private',
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000011',
				published: true,
				secret: 'visible',
				title: 'Public',
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
		])
		const finalResult = await stages.enforceResult({
			context,
			enforcement,
			operation: find,
			result: [
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '0198a43e-2431-7000-8000-000000000012',
					published: true,
					secret: 'hidden',
					title: 'Restored',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			],
		})
		expect(finalResult).toStrictEqual([
			{
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000012',
				published: true,
				title: 'Restored',
				updatedAt: '2026-08-03T00:00:00.000Z',
			},
		])
		await application.dispose()
	})

	it('runs asynchronous decisions sequentially through the shared executor', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'SequentialAccess',
			access: {
				operation: {
					read: () => {
						trace.push('developer')
						return Promise.resolve(true)
					},
				},
			},
			fields: { title: stringField() },
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: FindOperationAst<typeof schema> = {
			kind: 'find',
			query: new Query(schema).ast,
		}

		await stages.evaluate({ context, operation })
		expect(trace).toStrictEqual(['developer'])
		expect(vi.isMockFunction(trace.push)).toBe(false)
		await application.dispose()
	})

	it('honors contribution-owned master bypass without weakening enforced rules', async () => {
		const schema = Schema.define({
			className: 'MasterAccess',
			fields: { title: stringField() },
		})
		const bypass = definePlugin({
			name: 'fixture.master-bypass',
			setup: ({ access }) => {
				access.schema(
					'deny-anonymous',
					schema,
					{ operation: { read: false } },
					{ master: 'bypass' },
				)
			},
		})
		const application = await createApplication({
			access: { default: false },
			plugins: [bypass],
			schemas: [schema],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: FindOperationAst<typeof schema> = {
			kind: 'find',
			query: new Query(schema).ast,
		}
		const master = createTrustedMasterRequestContext(
			'fixture audit',
			'fixture-key',
			context,
		)

		await expect(stages.evaluate({ context, operation })).rejects.toMatchObject(
			{
				code: 'PERMISSION_DENIED',
			},
		)
		await expect(
			stages.evaluate({ context: master, operation }),
		).resolves.toBeDefined()
		await application.dispose()
	})

	it('cancels Access callbacks before later rules or business work can run', async () => {
		const controller = new AbortController()
		controller.abort('fixture cancelled')
		const cancelled = RequestContext.anonymous({
			requestId: 'cancelled-access',
			signal: controller.signal,
			source: requestSources.internal,
		})
		const schema = Schema.define({
			className: 'CancelledAccess',
			access: { operation: { read: () => true } },
			fields: { title: stringField() },
		})
		const application = await createApplication({
			schemas: [schema],
			plugins: [],
		})
		const stages = requireStages(createEnforcementStages(application))
		const operation: FindOperationAst<typeof schema> = {
			kind: 'find',
			query: new Query(schema).ast,
		}

		await expect(
			stages.evaluate({ context: cancelled, operation }),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		await application.dispose()
	})
})

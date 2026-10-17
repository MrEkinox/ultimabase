import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../../plugin.js'
import { SchemaRegistry } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import {
	databaseInclusionCapability,
	databasePersistencePlanCapability,
	databasePointerCapability,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
} from '../database/contracts.js'
import { bindRuntimeVirtualFields } from '../pipeline/application-bindings.js'
import { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

const context = RequestContext.anonymous({
	requestId: 'virtual-resolve-many',
	source: requestSources.internal,
})

const project = (
	record: Readonly<Record<string, unknown>>,
	request: DatabaseOperationRequest,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			request.plan.returning.selection.fields.map(({ field }) => [
				field,
				record[field],
			]),
		),
	)

const createPipeline = (executor: DatabaseOperationExecutor) => {
	const pipeline = new RuntimePipeline({
		commit: () => undefined,
		databaseOperation: executor,
		finalMutationValidation: ({ operation }) => operation,
		normalization: ({ operation }) => operation,
		structuralValidation: ({ operation }) => operation,
	})
	bindRuntimeVirtualFields(pipeline, Object.freeze({}))
	return pipeline
}

const id = (suffix: number): string =>
	`0199f090-2a50-7000-8000-0000000001${String(suffix).padStart(2, '0')}`

describe('resolveMany virtual fields (ADR-0325)', () => {
	it('resolves every row of one read in one call, in order', async () => {
		const calls: (readonly unknown[])[] = []
		const Tag = UltimaBase.Schema.define({
			className: 'ResolveManyTag',
			fields: (field) => ({
				name: field.string({ required: true }),
				shout: field.virtual({
					output: (output) => output.string(),
					select: { name: true },
					resolveMany: ({ items }) => {
						calls.push(items)
						return items.map((item) => String(item.name).toUpperCase())
					},
				}),
			}),
		})
		new SchemaRegistry([Tag]).resolveSchemaTargets()
		const rows = ['a', 'b', 'c'].map((name, index) =>
			immutableRecord({ id: id(index), name }),
		)
		const executor: DatabaseOperationExecutor = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => {
				const result: unknown = immutableArray(
					rows.map((row) => project(row, request)),
				)
				return Promise.resolve(result as DatabaseOperationResult<TOperation>)
			},
		}

		const result = await createPipeline(executor).execute({
			context,
			operation: immutableRecord({
				kind: 'find-many' as const,
				query: new QueryBuilder(Tag).select({ shout: true }).ast,
			}),
		})

		expect(result).toStrictEqual([
			{ id: id(0), shout: 'A' },
			{ id: id(1), shout: 'B' },
			{ id: id(2), shout: 'C' },
		])
		expect(calls).toStrictEqual([
			[
				{ id: id(0), name: 'a' },
				{ id: id(1), name: 'b' },
				{ id: id(2), name: 'c' },
			],
		])
	})

	it('rejects a result without one value per item', async () => {
		const Tag = UltimaBase.Schema.define({
			className: 'ResolveManyShortTag',
			fields: (field) => ({
				name: field.string({ required: true }),
				shout: field.virtual({
					output: (output) => output.string(),
					select: { name: true },
					resolveMany: () => ['only one'],
				}),
			}),
		})
		new SchemaRegistry([Tag]).resolveSchemaTargets()
		const executor: DatabaseOperationExecutor = {
			capabilities: { persistencePlans: databasePersistencePlanCapability },
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => {
				const result: unknown = immutableArray(
					[0, 1].map((index) =>
						project(immutableRecord({ id: id(index), name: 'x' }), request),
					),
				)
				return Promise.resolve(result as DatabaseOperationResult<TOperation>)
			},
		}

		await expect(
			createPipeline(executor).execute({
				context,
				operation: immutableRecord({
					kind: 'find-many' as const,
					query: new QueryBuilder(Tag).select({ shout: true }).ast,
				}),
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message:
				'Virtual field output is invalid: ResolveManyShortTag.shout resolveMany must return one value per item',
		})
	})

	it('requires exactly one of resolve and resolveMany', () => {
		expect(() =>
			UltimaBase.Schema.define({
				className: 'ResolveManyBoth',
				fields: (field) => ({
					// @ts-expect-error -- `resolve` and `resolveMany` exclude each other.
					both: field.virtual({
						output: (output) => output.string(),
						resolve: () => 'one',
						resolveMany: () => ['many'],
						select: { id: true },
					}),
				}),
			}),
		).toThrow('requires exactly one resolve or resolveMany function')
	})

	it('resolves included targets once per parent, parents in parallel', async () => {
		const events: string[] = []
		let release: (() => void) | undefined
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		const Reviewer = UltimaBase.Schema.define({
			className: 'ResolveManyReviewer',
			fields: (field) => ({
				name: field.string({ required: true }),
				label: field.virtual({
					output: (output) => output.string(),
					select: { name: true },
					resolveMany: async ({ items }) => {
						const names = items.map((item) => String(item.name))
						events.push(`start:${names.join(',')}`)
						// Both parents start before either finishes.
						if (events.length === 2) release?.()
						await gate
						events.push(`end:${names.join(',')}`)
						return names.map((name) => name.toUpperCase())
					},
				}),
			}),
		})
		const Article = UltimaBase.Schema.define({
			className: 'ResolveManyArticle',
			fields: (field) => ({
				reviewers: field.relation({ target: 'ResolveManyReviewer' }),
			}),
		})
		new SchemaRegistry([Reviewer, Article]).resolveSchemaTargets()
		const reviewers = new Map([
			[id(10), [immutableRecord({ id: id(11), name: 'ada' })]],
			[
				id(20),
				[
					immutableRecord({ id: id(21), name: 'grace' }),
					immutableRecord({ id: id(22), name: 'linus' }),
				],
			],
		])
		const executor: DatabaseOperationExecutor = {
			capabilities: {
				inclusions: databaseInclusionCapability,
				persistencePlans: databasePersistencePlanCapability,
				pointers: databasePointerCapability,
			},
			execute: <const TOperation extends DatabaseOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<DatabaseOperationResult<TOperation>> => {
				const result: unknown = immutableArray(
					[...reviewers.keys()].map((articleId) =>
						project(
							immutableRecord({
								createdAt: '2026-10-12T00:00:00.000Z',
								id: articleId,
								updatedAt: '2026-10-12T00:00:00.000Z',
							}),
							request,
						),
					),
				)
				return Promise.resolve(result as DatabaseOperationResult<TOperation>)
			},
			readIncludedValue: (record) =>
				immutableArray(reviewers.get(String(record.id)) ?? []),
		}

		const result = await createPipeline(executor).execute({
			context,
			operation: immutableRecord({
				kind: 'find-many' as const,
				query: new QueryBuilder(Article)
					.select({ id: true })
					.include('reviewers', (query) => query.select({ label: true })).ast,
			}),
		})

		expect(result).toStrictEqual([
			{ id: id(10), reviewers: [{ id: id(11), label: 'ADA' }] },
			{
				id: id(20),
				reviewers: [
					{ id: id(21), label: 'GRACE' },
					{ id: id(22), label: 'LINUS' },
				],
			},
		])
		expect(events.slice(0, 2).sort()).toStrictEqual([
			'start:ada',
			'start:grace,linus',
		])
	})
})

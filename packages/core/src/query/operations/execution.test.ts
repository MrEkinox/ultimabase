import { describe, expect, it } from 'vitest'
import { QueryBuilder } from '../query/query.js'

import {
	executeStaticSchemaMutation,
	normalizeOperationOptions,
	runWithQueryExecution,
	type QueryExecutionDispatcher,
} from './execution.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const PostSchema = UltimaBase.Schema.define({
	className: 'ContextualQueryPost',
	fields: (field) => ({ title: field.string() }),
})

/** Records the exact terminal routed into one active execution scope. */
class RecordingDispatcher implements QueryExecutionDispatcher {
	readonly operations: unknown[] = []
	readonly #failure: Error

	constructor(failure: Error) {
		this.#failure = failure
	}

	execute(operation: unknown): Promise<unknown> {
		this.operations.push(operation)

		return Promise.reject(this.#failure)
	}
}

describe('contextual operation execution', () => {
	it('fails clearly when neither an ambient request nor an app is available', () => {
		expect(() => PostSchema.findMany()).toThrow(
			expect.objectContaining({
				code: 'MISSING_EXECUTION_CONTEXT',
				internalDetails: { reason: 'operation-owner-missing' },
			}),
		)
		expect(() =>
			PostSchema.findMany(undefined, { context: {} as never }),
		).toThrow(
			expect.objectContaining({
				code: 'MISSING_EXECUTION_CONTEXT',
				internalDetails: { reason: 'operation-owner-missing' },
			}),
		)
	})

	it('routes one immutable branch independently across concurrent scopes', async () => {
		const firstFailure = new Error('first execution')
		const secondFailure = new Error('second execution')
		const first = new RecordingDispatcher(firstFailure)
		const second = new RecordingDispatcher(secondFailure)
		// One immutable input shared by both scopes (the `QueryBuilder` overload of
		// `findMany` was removed by ADR-0315).
		const reusable = {
			where: { title: { eq: 'shared' } },
			select: { id: true },
		} as const
		const firstApplication = {}
		const secondApplication = {}

		const [firstResult, secondResult] = await Promise.allSettled([
			runWithQueryExecution(firstApplication, first, () =>
				PostSchema.findMany(reusable),
			),
			runWithQueryExecution(secondApplication, second, () =>
				PostSchema.findMany(reusable),
			),
		])

		expect(firstResult).toStrictEqual({
			reason: firstFailure,
			status: 'rejected',
		})
		expect(secondResult).toStrictEqual({
			reason: secondFailure,
			status: 'rejected',
		})
		expect(first.operations).toHaveLength(1)
		expect(second.operations).toHaveLength(1)
		expect(first.operations[0]).toMatchObject({ kind: 'find-many' })
		expect(second.operations[0]).toMatchObject({ kind: 'find-many' })
		expect(first.operations[0]).toMatchObject({
			query: {
				selection: { fields: [{ field: 'id', kind: 'selected-field' }] },
			},
		})
		// Execution never becomes mutable state on the reusable input itself.
		expect(reusable).toStrictEqual({
			where: { title: { eq: 'shared' } },
			select: { id: true },
		})
	})

	it('rejects the removed application selector before dispatch', async () => {
		const removedOptions = { ultimabase: {} } as never
		const active = new RecordingDispatcher(new Error('unused execution'))

		await runWithQueryExecution({}, active, async () => {
			expect(() => PostSchema.findMany(undefined, removedOptions)).toThrow(
				'operation options contain unknown key: ultimabase',
			)
			await expect(
				executeStaticSchemaMutation(
					PostSchema,
					'fixture.command',
					{},
					removedOptions,
				),
			).rejects.toThrow('operation options contain unknown key: ultimabase')
		})
		expect(active.operations).toHaveLength(0)
	})

	it('normalizes operation authority without entering the AST', () => {
		const context = {}
		const terminal = normalizeOperationOptions({
			context: context as never,
			useMasterKey: true,
		})

		expect(terminal).toStrictEqual({
			context,
			useMasterKey: true,
		})
		expect(Object.isFrozen(terminal)).toBe(true)
		const ast = new QueryBuilder(PostSchema).ast
		expect('context' in ast).toBe(false)
		expect('ultimabase' in ast).toBe(false)
		expect('useMasterKey' in ast).toBe(false)
		expect(() => normalizeOperationOptions({ unknown: true } as never)).toThrow(
			'operation options contain unknown key: unknown',
		)
		expect(() => normalizeOperationOptions({ atomic: false } as never)).toThrow(
			'operation options contain unknown key: atomic',
		)
		expect(() =>
			normalizeOperationOptions({ context: 'forged' } as never),
		).toThrow('operation context must be a RequestContext instance')
		expect(normalizeOperationOptions({ useMasterKey: false })).toEqual({
			context: undefined,
			useMasterKey: false,
		})
		expect(() =>
			normalizeOperationOptions({ useMasterKey: 'true' } as never),
		).toThrow('operation useMasterKey must be a boolean when present')
	})
})

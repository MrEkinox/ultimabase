import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'
import { QueryBuilder } from '../query/query.js'

import {
	normalizeOperationOptions,
	runWithQueryExecution,
	type QueryExecutionDispatcher,
} from './execution.js'

const PostSchema = Schema.define({
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
		const reusable = new QueryBuilder(PostSchema)
			.where((where) => where.eq('title', 'shared'))
			.select({ id: true })
		const firstApplication = {}
		const secondApplication = {}

		const [firstResult, secondResult] = await Promise.allSettled([
			runWithQueryExecution(firstApplication, first, () =>
				PostSchema.findMany(reusable.build()),
			),
			runWithQueryExecution(secondApplication, second, () =>
				PostSchema.findMany(reusable.build()),
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
		expect(reusable.ast.selection.fields).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
		])
		// Execution never becomes mutable state on the reusable QueryBuilder itself.
		expect('engine' in reusable).toBe(false)
	})

	it('normalizes operation ownership without entering the AST', () => {
		const context = {}
		const owner = {}
		const terminal = normalizeOperationOptions({
			context: context as never,
			ultimabase: owner as never,
			useMasterKey: true,
		})

		expect(terminal).toStrictEqual({
			context,
			ultimabase: owner,
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
		expect(() =>
			normalizeOperationOptions({ useMasterKey: false } as never),
		).toThrow('operation useMasterKey must be true when present')
	})
})

import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	normalizeQueryBulkTerminalOptions,
	normalizeQueryTerminalOptions,
	runWithQueryExecution,
	type QueryExecutionDispatcher,
} from './execution.js'

const PostSchema = Schema.define({
	className: 'ContextualQueryPost',
	fields: { title: stringField() },
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

describe('contextual Query execution', () => {
	it('fails clearly when neither an ambient request nor an app is available', () => {
		expect(() => PostSchema.query().find()).toThrow(
			expect.objectContaining({
				code: 'MISSING_EXECUTION_CONTEXT',
				internalDetails: { reason: 'query-terminal-owner-missing' },
			}),
		)
		expect(() => PostSchema.query().find({ context: {} as never })).toThrow(
			expect.objectContaining({
				code: 'MISSING_EXECUTION_CONTEXT',
				internalDetails: { reason: 'query-terminal-owner-missing' },
			}),
		)
	})

	it('routes one immutable branch independently across concurrent scopes', async () => {
		const firstFailure = new Error('first execution')
		const secondFailure = new Error('second execution')
		const first = new RecordingDispatcher(firstFailure)
		const second = new RecordingDispatcher(secondFailure)
		const reusable = PostSchema.query()
			.where((where) => where.eq('title', 'shared'))
			.select({ id: true })
		const firstApplication = {}
		const secondApplication = {}

		const [firstResult, secondResult] = await Promise.allSettled([
			runWithQueryExecution(firstApplication, first, () => reusable.find()),
			runWithQueryExecution(secondApplication, second, () => reusable.find()),
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
		expect(first.operations[0]).toMatchObject({ kind: 'find' })
		expect(second.operations[0]).toMatchObject({ kind: 'find' })
		expect(reusable.ast.selection.fields).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
		])
		// Execution never becomes mutable state on the reusable Query itself.
		expect('engine' in reusable).toBe(false)
	})

	it('normalizes terminal ownership and bulk grouping without entering the AST', () => {
		const context = {}
		const owner = {}
		const terminal = normalizeQueryTerminalOptions({
			context: context as never,
			ultimabase: owner as never,
			useMasterKey: true,
		})
		const bulk = normalizeQueryBulkTerminalOptions({
			atomic: false,
			ultimabase: owner as never,
		})

		expect(terminal).toStrictEqual({
			context,
			ultimabase: owner,
			useMasterKey: true,
		})
		expect(bulk).toStrictEqual({
			bulk: { atomic: false },
			context: undefined,
			ultimabase: owner,
			useMasterKey: false,
		})
		expect(Object.isFrozen(terminal)).toBe(true)
		expect(Object.isFrozen(bulk)).toBe(true)
		expect('context' in PostSchema.query().ast).toBe(false)
		expect('ultimabase' in PostSchema.query().ast).toBe(false)
		expect('useMasterKey' in PostSchema.query().ast).toBe(false)
		expect(() =>
			normalizeQueryTerminalOptions({ unknown: true } as never),
		).toThrow('query terminal options contain unknown key: unknown')
		expect(() =>
			normalizeQueryBulkTerminalOptions({ atomic: 'no' } as never),
		).toThrow('bulk operation atomic option must be a boolean')
		expect(() =>
			normalizeQueryTerminalOptions({ context: 'forged' } as never),
		).toThrow('query terminal context must be a RequestContext instance')
		expect(() =>
			normalizeQueryTerminalOptions({ useMasterKey: false } as never),
		).toThrow('query terminal useMasterKey must be true when present')
	})
})

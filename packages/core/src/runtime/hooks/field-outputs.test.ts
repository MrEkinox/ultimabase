import { immutableArray, immutableRecord } from '@ultimabase/shared'
import {
	QueryBuilder,
	type CountOperationAst,
	type DeleteManyOperationAst,
	type ExistsOperationAst,
	type FindManyOperationAst,
	type FindOneOperationAst,
	type QueryExpressionNode,
	normalizeUpdateExpression,
	type UpdateManyOperationAst,
} from '../../query/index.js'
import { objectField, Schema, stringField } from '../../schema/index.js'
import { describe, expect, it, vi } from 'vitest'

import {
	collectOperationFieldOutputs,
	transformOperationFieldOutputs,
	type RuntimeFieldOutputValue,
} from './field-outputs.js'

const outputSchema = Schema.define({
	className: 'FieldOutputTraversal',
	fields: {
		title: stringField(),
		profile: objectField({
			fields: {
				displayName: stringField(),
				contact: objectField({
					fields: { email: stringField() },
				}),
			},
		}),
		nickname: stringField(),
		bio: stringField(),
		secret: stringField(),
	},
})

const describeOutputs = (outputs: readonly RuntimeFieldOutputValue[]) =>
	outputs.map(({ fieldPath, itemIndex, kind, mode, valuePath }) => ({
		fieldPath,
		itemIndex,
		kind,
		mode,
		valuePath,
	}))

describe('runtime field outputs', () => {
	it('visits only present selected values with nested children before parents', () => {
		const operation: FindManyOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title' | 'profile' | 'nickname' | 'bio'
		> = {
			kind: 'find-many',
			query: new QueryBuilder(outputSchema).select({
				title: true,
				profile: true,
				nickname: true,
				bio: true,
			}).ast,
		}
		const result = immutableArray([
			immutableRecord({
				bio: null,
				title: 'First',
				profile: immutableRecord({
					displayName: 'Ada',
					contact: immutableRecord({ email: 'ada@example.com' }),
				}),
				nickname: null,
				// Extra adapter data never broadens the normalized query selection.
				secret: 'hidden',
			}),
		])

		expect(
			describeOutputs(collectOperationFieldOutputs(operation, result)),
		).toStrictEqual([
			{
				fieldPath: ['title'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'title'],
			},
			{
				fieldPath: ['profile', 'displayName'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'profile', 'displayName'],
			},
			{
				fieldPath: ['profile', 'contact', 'email'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'profile', 'contact', 'email'],
			},
			{
				fieldPath: ['profile', 'contact'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'profile', 'contact'],
			},
			{
				fieldPath: ['profile'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'profile'],
			},
			{
				fieldPath: ['nickname'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'nickname'],
			},
			{
				fieldPath: ['bio'],
				itemIndex: 0,
				kind: 'find-many',
				mode: 'object',
				valuePath: [0, 'bio'],
			},
		])
	})

	it('replaces child values immutably and lets parents observe transformed children', async () => {
		const operation: FindManyOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title' | 'profile'
		> = {
			kind: 'find-many',
			query: new QueryBuilder(outputSchema).select({
				title: true,
				profile: true,
			}).ast,
		}
		const originalProfile = immutableRecord({
			displayName: 'Ada',
			contact: immutableRecord({ email: 'ada@example.com' }),
		})
		const originalRecord = immutableRecord({
			title: 'First',
			profile: originalProfile,
		})
		const result = immutableArray([originalRecord])
		let observedParent: unknown

		const transformed = await transformOperationFieldOutputs(
			operation,
			result,
			({ fieldPath, value }) => {
				if (fieldPath.length === 1 && fieldPath[0] === 'profile') {
					observedParent = value
					return undefined
				}

				return typeof value === 'string' ? value.toUpperCase() : undefined
			},
		)

		expect(observedParent).toStrictEqual({
			contact: { email: 'ADA@EXAMPLE.COM' },
			displayName: 'ADA',
		})
		expect(transformed).toStrictEqual([
			{
				title: 'FIRST',
				profile: {
					contact: { email: 'ADA@EXAMPLE.COM' },
					displayName: 'ADA',
				},
			},
		])
		expect(result[0]).toBe(originalRecord)
		expect(result[0].profile).toBe(originalProfile)
		expect(result[0].profile.displayName).toBe('Ada')
		expect(Object.isFrozen(transformed)).toBe(true)
		expect(Object.isFrozen(transformed[0])).toBe(true)
		expect(Object.isFrozen(transformed[0]?.profile)).toBe(true)

		await expect(
			transformOperationFieldOutputs(operation, result, () => undefined),
		).resolves.toBe(result)
	})

	it('resolves selected set-based update and delete results without materializations', async () => {
		const query = new QueryBuilder(outputSchema).select({ title: true }).ast
		const updateExpression = normalizeUpdateExpression(outputSchema, {
			title: 'Updated',
		})
		const update: UpdateManyOperationAst<
			typeof outputSchema,
			typeof updateExpression,
			QueryExpressionNode,
			'title'
		> = {
			kind: 'update-many',
			query,
			update: updateExpression,
		}
		const deletion: DeleteManyOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title'
		> = {
			kind: 'delete-many',
			query,
		}
		const result = immutableArray([
			immutableRecord({ title: 'First' }),
			immutableRecord({ title: 'Second' }),
		])

		expect(
			describeOutputs(collectOperationFieldOutputs(update, result)),
		).toEqual([
			{
				fieldPath: ['title'],
				itemIndex: 0,
				kind: 'update-many',
				mode: 'object',
				valuePath: [0, 'title'],
			},
			{
				fieldPath: ['title'],
				itemIndex: 1,
				kind: 'update-many',
				mode: 'object',
				valuePath: [1, 'title'],
			},
		])
		expect(
			describeOutputs(collectOperationFieldOutputs(deletion, result)),
		).toEqual([
			{
				fieldPath: ['title'],
				itemIndex: 0,
				kind: 'delete-many',
				mode: 'object',
				valuePath: [0, 'title'],
			},
			{
				fieldPath: ['title'],
				itemIndex: 1,
				kind: 'delete-many',
				mode: 'object',
				valuePath: [1, 'title'],
			},
		])
		await expect(
			transformOperationFieldOutputs(update, result, ({ value }) =>
				typeof value === 'string' ? value.toUpperCase() : value,
			),
		).resolves.toStrictEqual([{ title: 'FIRST' }, { title: 'SECOND' }])
	})

	it('skips null, empty, and scalar terminal results without calling the visitor', async () => {
		const visitor = vi.fn(() => 'unreachable')
		const first: FindOneOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title'
		> = {
			kind: 'find-one',
			query: new QueryBuilder(outputSchema).select({ title: true }).ast,
		}
		const find: FindManyOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title'
		> = {
			kind: 'find-many',
			query: new QueryBuilder(outputSchema).select({ title: true }).ast,
		}
		const count = {
			kind: 'count',
			query: new QueryBuilder(outputSchema).ast,
		} satisfies CountOperationAst<typeof outputSchema>
		const exists = {
			kind: 'exists',
			query: new QueryBuilder(outputSchema).ast,
		} satisfies ExistsOperationAst<typeof outputSchema>
		const empty = immutableArray([])

		await expect(
			transformOperationFieldOutputs(first, null, visitor),
		).resolves.toBeNull()
		await expect(
			transformOperationFieldOutputs(find, empty, visitor),
		).resolves.toBe(empty)
		await expect(
			transformOperationFieldOutputs(count, 3, visitor),
		).resolves.toBe(3)
		await expect(
			transformOperationFieldOutputs(exists, true, visitor),
		).resolves.toBe(true)
		expect(visitor).not.toHaveBeenCalled()
	})

	it('rejects malformed record terminal shapes before visiting fields', async () => {
		const find = {
			kind: 'find-many',
			query: new QueryBuilder(outputSchema).ast,
		} satisfies FindManyOperationAst<typeof outputSchema>

		await expect(
			transformOperationFieldOutputs(find, null as never, () => undefined),
		).rejects.toThrow('Runtime field outputs cannot be null for this operation')
		await expect(
			transformOperationFieldOutputs(find, {} as never, () => undefined),
		).rejects.toThrow('Runtime field outputs require an array result')
		await expect(
			transformOperationFieldOutputs(find, [null] as never, () => undefined),
		).rejects.toThrow('Runtime field output record[0] must be a logical record')
	})
})

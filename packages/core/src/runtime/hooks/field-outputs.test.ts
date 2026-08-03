import { immutableArray, immutableRecord } from '@ultimabase/shared'
import {
	Query,
	type CountOperationAst,
	type ExistsOperationAst,
	type FindOperationAst,
	type FirstOperationAst,
	type QueryExpressionNode,
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
		nickname: stringField({ validation: { nullable: true } }),
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
		const operation: FindOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title' | 'profile' | 'nickname' | 'bio'
		> = {
			kind: 'find',
			query: new Query(outputSchema).select(
				'title',
				'profile',
				'nickname',
				'bio',
			).ast,
		}
		const result = immutableArray([
			immutableRecord({
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
				kind: 'find',
				mode: 'object',
				valuePath: [0, 'title'],
			},
			{
				fieldPath: ['profile', 'displayName'],
				itemIndex: 0,
				kind: 'find',
				mode: 'object',
				valuePath: [0, 'profile', 'displayName'],
			},
			{
				fieldPath: ['profile', 'contact', 'email'],
				itemIndex: 0,
				kind: 'find',
				mode: 'object',
				valuePath: [0, 'profile', 'contact', 'email'],
			},
			{
				fieldPath: ['profile', 'contact'],
				itemIndex: 0,
				kind: 'find',
				mode: 'object',
				valuePath: [0, 'profile', 'contact'],
			},
			{
				fieldPath: ['profile'],
				itemIndex: 0,
				kind: 'find',
				mode: 'object',
				valuePath: [0, 'profile'],
			},
			{
				fieldPath: ['nickname'],
				itemIndex: 0,
				kind: 'find',
				mode: 'object',
				valuePath: [0, 'nickname'],
			},
		])
	})

	it('replaces child values immutably and lets parents observe transformed children', async () => {
		const operation: FindOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title' | 'profile'
		> = {
			kind: 'find',
			query: new Query(outputSchema).select('title', 'profile').ast,
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

	it('skips null, empty, and scalar terminal results without calling the visitor', async () => {
		const visitor = vi.fn(() => 'unreachable')
		const first: FirstOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title'
		> = {
			kind: 'first',
			query: new Query(outputSchema).select('title').ast,
		}
		const find: FindOperationAst<
			typeof outputSchema,
			QueryExpressionNode,
			'title'
		> = {
			kind: 'find',
			query: new Query(outputSchema).select('title').ast,
		}
		const count = {
			kind: 'count',
			query: new Query(outputSchema).ast,
		} satisfies CountOperationAst<typeof outputSchema>
		const exists = {
			kind: 'exists',
			query: new Query(outputSchema).ast,
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
			kind: 'find',
			query: new Query(outputSchema).ast,
		} satisfies FindOperationAst<typeof outputSchema>

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

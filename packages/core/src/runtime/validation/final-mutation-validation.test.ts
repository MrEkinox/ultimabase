import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import { QueryBuilder } from '../../plugin.js'
import {
	normalizeUpdateExpression,
	type UpdateExpressionInput,
} from '../../query/index.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import type { SchemaItem } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { createFinalMutationValidationStage } from './final-mutation-validation.js'
import { createRuntimeValidationStage } from './runtime-validation.js'

// The database computes atomic deltas and object patches from the stored
// value, so Core validates that projected value on the locked target before
// the write instead of letting the adapter fail to read it back.
const Counter = UltimaBase.Schema.define({
	className: 'ProjectedValueCounter',
	fields: (field) => ({
		code: field.string({ indexed: 'unique' }),
		views: field.int(),
		rating: field.float(),
		amount: field.decimal({ precision: 5, scale: 2 }),
		location: field.object({
			fields: (child) => ({
				lat: child.float({ required: true }),
				lng: child.float({ required: true }),
				label: child.string(),
			}),
		}),
		address: field.object({
			required: true,
			fields: (child) => ({
				line1: child.string({ required: true }),
				geo: child.object({
					fields: (grandchild) => ({
						lat: grandchild.float({ required: true }),
						lng: grandchild.float({ required: true }),
					}),
				}),
			}),
		}),
	}),
})

const context = RequestContext.anonymous({
	requestId: 'projected-value-validation',
	source: requestSources.internal,
})
const initialValidation = createRuntimeValidationStage({
	clock: () => new Date('2026-10-14T10:00:00.000Z'),
})
const finalValidation = createFinalMutationValidationStage()
const query = new QueryBuilder(Counter).ast

type CounterItem = Readonly<SchemaItem<typeof Counter>>

const stored = (values: Partial<CounterItem> = {}): CounterItem => ({
	id: '0198f090-2a50-7000-8000-000000000001',
	createdAt: '2026-10-01T00:00:00.000Z',
	updatedAt: '2026-10-01T00:00:00.000Z',
	code: 'counter',
	views: 0,
	rating: 0,
	amount: '0.00',
	location: null,
	address: { line1: '1 Rue', geo: null },
	...values,
})

type CounterUpdate = UpdateExpressionInput<typeof Counter>

const updateOne = async (data: CounterUpdate) =>
	initialValidation({
		context,
		operation: {
			kind: 'update-one',
			query,
			update: normalizeUpdateExpression(Counter, data),
		},
	})

/** Runs the final stage on a locked target and returns its rejection, if any. */
const rejection = async (
	operation: Awaited<ReturnType<typeof updateOne>>,
	target: CounterItem | null,
): Promise<unknown> => {
	try {
		await finalValidation({
			context,
			operation,
			previousOperation: operation,
			target,
		})
	} catch (error: unknown) {
		return error
	}
	return undefined
}

const issues = (error: unknown): unknown =>
	error instanceof FrameworkError && error.code === 'VALIDATION_ERROR'
		? (error.publicDetails as Readonly<{ issues?: unknown }> | undefined)
				?.issues
		: error

describe('final mutation validation of projected values', () => {
	it('rejects an increment or decrement leaving the safe integer range', async () => {
		const increment = await updateOne({ views: { increment: 1 } })
		const decrement = await updateOne({ views: { decrement: 1 } })

		expect(
			issues(
				await rejection(increment, stored({ views: Number.MAX_SAFE_INTEGER })),
			),
		).toMatchObject([
			{ code: 'int.type', path: ['update', 0, 'views', 'value'] },
		])
		expect(
			issues(
				await rejection(decrement, stored({ views: -Number.MAX_SAFE_INTEGER })),
			),
		).toMatchObject([
			{ code: 'int.type', path: ['update', 0, 'views', 'value'] },
		])
		await expect(
			rejection(increment, stored({ views: Number.MAX_SAFE_INTEGER - 1 })),
		).resolves.toBeUndefined()
	})

	it('rejects a non-finite float and a decimal beyond its precision', async () => {
		const operation = await updateOne({
			rating: { increment: Number.MAX_VALUE },
			amount: { increment: '0.01' },
		})

		expect(
			issues(
				await rejection(
					operation,
					stored({ rating: Number.MAX_VALUE, amount: '999.99' }),
				),
			),
		).toMatchObject([
			{ code: 'float.type', path: ['update', 0, 'rating', 'value'] },
			{ code: 'decimal.precision', path: ['update', 1, 'amount', 'value'] },
		])
	})

	it('requires the children of a patch applied to a stored null object', async () => {
		const operation = await updateOne({ location: { lat: 1 } })

		expect(issues(await rejection(operation, stored()))).toMatchObject([
			{
				code: 'field.required',
				path: ['update', 0, 'location', 'value', 'lng'],
			},
		])
		await expect(
			rejection(
				operation,
				stored({ location: { lat: 0, lng: 0, label: null } }),
			),
		).resolves.toBeUndefined()
		await expect(
			rejection(await updateOne({ location: { lat: 1, lng: 2 } }), stored()),
		).resolves.toBeUndefined()
	})

	it('requires the children of a nested patch applied to a stored null child', async () => {
		const operation = await updateOne({ address: { geo: { lat: 1 } } })

		expect(issues(await rejection(operation, stored()))).toMatchObject([
			{
				code: 'field.required',
				path: ['update', 0, 'address', 'value', 'geo', 'lng'],
			},
		])
		await expect(
			rejection(
				await updateOne({ address: { geo: { lat: 1, lng: 2 } } }),
				stored(),
			),
		).resolves.toBeUndefined()
	})

	it('projects the update branch of an upsert and every prepared bulk target', async () => {
		const update = normalizeUpdateExpression(Counter, {
			views: { increment: 1 },
		})
		const upsert = await initialValidation({
			context,
			operation: {
				kind: 'upsert-one',
				query: new QueryBuilder(Counter).where((where) =>
					where.eq('code', 'counter'),
				).ast,
				target: { kind: 'unique-upsert-target', fields: ['code'] },
				create: { code: 'counter', address: { line1: '1 Rue' } },
				update,
			},
		})
		const many = await initialValidation({
			context,
			operation: { kind: 'update-many', query, update },
		})
		const finalRejection = async (
			run: () => ReturnType<typeof finalValidation>,
		): Promise<unknown> => {
			try {
				await run()
			} catch (error: unknown) {
				return error
			}
			return undefined
		}
		const unsafe = stored({ views: Number.MAX_SAFE_INTEGER })
		const expected = [
			{ code: 'int.type', path: ['update', 0, 'views', 'value'] },
		]

		expect(
			issues(
				await finalRejection(() =>
					finalValidation({
						context,
						operation: upsert,
						previousOperation: upsert,
						target: unsafe,
					}),
				),
			),
		).toMatchObject(expected)
		// The create branch has no stored value to project.
		await expect(
			finalRejection(() =>
				finalValidation({
					context,
					operation: upsert,
					previousOperation: upsert,
					target: null,
				}),
			),
		).resolves.toBeUndefined()
		// One issue names the update, however many targets it would break.
		expect(
			issues(
				await finalRejection(() =>
					finalValidation({
						context,
						operation: many,
						previousOperation: many,
						target: undefined,
						targets: [stored(), unsafe, unsafe],
					}),
				),
			),
		).toStrictEqual([expect.objectContaining(expected[0])])
	})

	it('leaves a missing target and unprojected fields to the adapter', async () => {
		const operation = await updateOne({ views: { increment: 1 } })

		await expect(rejection(operation, null)).resolves.toBeUndefined()
		// A stored null stays null in the database, as `null + 1` does.
		await expect(
			rejection(operation, stored({ views: null })),
		).resolves.toBeUndefined()
	})
})

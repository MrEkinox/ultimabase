import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it, vi } from 'vitest'

import { FrameworkError } from '../../foundation.js'
import {
	decrement,
	increment,
	normalizeUpdateExpression,
	QueryBuilder,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	PreparedDatabaseOperation,
} from '../database/contracts.js'
import { databasePersistencePlanCapability } from '../database/contracts.js'
import { executeRuntimeDatabaseOperation } from '../pipeline/database-execution.js'
import { createFinalMutationValidationStage } from './final-mutation-validation.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'

const instant = '2026-08-22T10:00:00.000Z'
const objectId = '0198d70e-e400-7000-8000-000000000001'
const context = RequestContext.anonymous({
	requestId: 'projected-arithmetic-validation',
	source: requestSources.internal,
})

const completeRecord = <
	const TValues extends Readonly<Record<string, unknown>>,
>(
	values: TValues,
) =>
	immutableRecord({
		createdAt: instant,
		id: objectId,
		updatedAt: instant,
		...values,
	})

const passThrough = <TValue>(
	validate: (value: unknown) => void,
): StandardSchemaV1<TValue> => ({
	'~standard': {
		validate: (value: unknown) => {
			validate(value)
			return { value: value as TValue }
		},
		vendor: 'projected-arithmetic-test',
		version: 1,
	},
})

const readIssues = (error: unknown): readonly unknown[] => {
	if (!(error instanceof FrameworkError)) throw error
	const details: unknown = error.publicDetails
	const issues: unknown = isPlainRecord(details) ? details.issues : undefined

	return isUnknownArray(issues) ? issues : []
}

describe('projected arithmetic field validation', () => {
	it('validates direct update and both explicit upsert branches once', () => {
		const validate = vi.fn()
		const schema = Schema.define({
			className: 'DirectMutationValidationCounts',
			fields: (field) => ({
				title: field.string({
					required: true,
					validation: passThrough<string>(validate),
				}),
			}),
		})
		const query = new QueryBuilder(schema).where((where) =>
			where.eq('id', objectId),
		)
		const updateOne = immutableRecord({
			kind: 'update-one',
			query: query.ast,
			update: normalizeUpdateExpression(schema, { title: 'updated' }),
		}) satisfies UpdateOneOperationAst<typeof schema>

		createFinalMutationValidationStage()({
			context,
			operation: updateOne,
			previousOperation: updateOne,
			target: null,
		})
		expect(validate.mock.calls).toStrictEqual([['updated']])

		validate.mockClear()
		const upsert = immutableRecord({
			create: completeRecord({ title: 'created' }),
			kind: 'upsert-one',
			query: query.ast,
			target: immutableRecord({
				fields: ['id'],
				kind: 'unique-upsert-target' as const,
			}),
			update: normalizeUpdateExpression(schema, { title: 'updated' }),
		}) as unknown as UpsertOneOperationAst<typeof schema>

		createFinalMutationValidationStage()({
			context,
			operation: upsert,
			previousOperation: upsert,
			target: completeRecord({ title: 'current' }),
		})
		expect(validate.mock.calls).toStrictEqual([['created'], ['updated']])
	})

	it('validates each singular projected numeric value once and retains atomic deltas', async () => {
		const bigintValidate = vi.fn()
		const decimalValidate = vi.fn()
		const floatValidate = vi.fn()
		const intValidate = vi.fn()
		const schema = Schema.define({
			className: 'ProjectedNumericValues',
			fields: (field) => ({
				balance: field.decimal({
					precision: 6,
					required: true,
					scale: 2,
					validation: passThrough<string>(decimalValidate),
				}),
				ratio: field.float({
					required: true,
					validation: passThrough<number>(floatValidate),
				}),
				sequence: field.bigint({
					required: true,
					validation: passThrough<bigint>(bigintValidate),
				}),
				visits: field.int({
					required: true,
					validation: passThrough<number>(intValidate),
				}),
			}),
		})
		const operation = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: normalizeUpdateExpression(schema, {
				balance: increment('1.25'),
				ratio: decrement(0.5),
				sequence: increment(2n),
				visits: increment(3),
			}),
		}) satisfies UpdateOneOperationAst<typeof schema>
		const target = completeRecord({
			balance: '10.00',
			ratio: 2,
			sequence: 5n,
			visits: 4,
		})

		const validated = await createFinalMutationValidationStage()({
			context,
			operation,
			previousOperation: operation,
			target,
		})

		expect(bigintValidate).toHaveBeenCalledExactlyOnceWith(7n)
		expect(decimalValidate).toHaveBeenCalledExactlyOnceWith('11.25')
		expect(floatValidate).toHaveBeenCalledExactlyOnceWith(1.5)
		expect(intValidate).toHaveBeenCalledExactlyOnceWith(7)
		expect(validated.update).toStrictEqual(operation.update)
	})

	it('rejects an application-invalid projection before changing the delta', () => {
		const validate = vi.fn((value: unknown) =>
			value === 10
				? { value }
				: { issues: [{ message: 'Score cannot exceed ten' }] },
		)
		const validator: StandardSchemaV1<number> = {
			'~standard': {
				validate,
				vendor: 'projected-rejection-test',
				version: 1,
			},
		}
		const schema = Schema.define({
			className: 'RejectedProjectedValue',
			fields: (field) => ({
				score: field.int({
					required: true,
					validation: validator,
				}),
			}),
		})
		const operation = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: normalizeUpdateExpression(schema, { score: increment(1) }),
		}) satisfies UpdateOneOperationAst<typeof schema>

		expect(() =>
			createFinalMutationValidationStage()({
				context,
				operation,
				previousOperation: operation,
				target: completeRecord({ score: 10 }),
			}),
		).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		expect(validate).toHaveBeenCalledExactlyOnceWith(11)
		expect(operation.update.operations[0]).toMatchObject({
			kind: 'increment',
			value: 1,
		})
	})

	it('forwards accepted deltas unchanged and rejects invalid projections before adapter execution', async () => {
		const validate = vi.fn((value: unknown) =>
			typeof value === 'number' && value <= 5
				? { value }
				: { issues: [{ message: 'Score cannot exceed five' }] },
		)
		const validator: StandardSchemaV1<number> = {
			'~standard': {
				validate,
				vendor: 'adapter-arithmetic-test',
				version: 1,
			},
		}
		const schema = Schema.define({
			className: 'AdapterProjectedValue',
			fields: (field) => ({
				score: field.int({ required: true, validation: validator }),
			}),
		})
		const createOperation = (delta: number) =>
			immutableRecord({
				kind: 'update-one' as const,
				query: new QueryBuilder(schema).ast,
				update: normalizeUpdateExpression(schema, { score: increment(delta) }),
			}) satisfies UpdateOneOperationAst<typeof schema>
		const execute = (delta: number, current: number) => {
			let executedOperation: DatabaseMutationOperationAst | undefined
			const target = completeRecord({ score: current })
			const transaction: DatabaseTransactionAdapter = {
				capabilities: {
					persistencePlans: databasePersistencePlanCapability,
				},
				commit: () => Promise.resolve(),
				execute: <const TOperation extends DatabaseOperationAst>() =>
					Promise.reject<DatabaseOperationResult<TOperation>>(
						new TypeError('Unexpected direct execution'),
					),
				kind: 'database-transaction-adapter',
				prepare: <const TOperation extends DatabaseMutationOperationAst>() =>
					Promise.resolve(
						createPreparedOperationFixture<TOperation>({
							execute: () =>
								Promise.resolve(
									completeRecord({
										score: current + delta,
									}) as unknown as DatabaseOperationResult<TOperation>,
								),
							onExecute: (request) => {
								executedOperation = request?.operation
							},
							target,
						}),
					) as Promise<PreparedDatabaseOperation<TOperation>>,
				rollback: () => Promise.resolve(),
			}
			const operation = createOperation(delta)
			const result = executeRuntimeDatabaseOperation(
				transaction,
				context,
				undefined,
				undefined,
				{ constraints: [], operation },
				createFinalMutationValidationStage(),
				undefined,
				undefined,
			)

			return { executedOperation: () => executedOperation, operation, result }
		}

		const accepted = execute(1, 4)
		await expect(accepted.result).resolves.toMatchObject({
			result: { score: 5 },
		})
		expect(accepted.executedOperation()).toMatchObject({
			update: {
				operations: [expect.objectContaining({ kind: 'increment', value: 1 })],
			},
		})

		const rejected = execute(1, 5)
		await expect(rejected.result).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
		})
		expect(rejected.executedOperation()).toBeUndefined()
	})

	it('rejects unsafe integer and decimal projections structurally before the validator', () => {
		const intValidate = vi.fn()
		const decimalValidate = vi.fn()
		const schema = Schema.define({
			className: 'StructurallyRejectedProjection',
			fields: (field) => ({
				amount: field.decimal({
					precision: 4,
					required: true,
					scale: 2,
					validation: passThrough<string>(decimalValidate),
				}),
				count: field.int({
					required: true,
					validation: passThrough<number>(intValidate),
				}),
			}),
		})
		const intOperation = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: normalizeUpdateExpression(schema, { count: increment(1) }),
		}) satisfies UpdateOneOperationAst<typeof schema>
		const decimalOperation = immutableRecord({
			kind: 'update-one',
			query: new QueryBuilder(schema).ast,
			update: normalizeUpdateExpression(schema, { amount: increment('0.01') }),
		}) satisfies UpdateOneOperationAst<typeof schema>

		for (const [operation, target, code] of [
			[
				intOperation,
				completeRecord({ amount: '1.00', count: Number.MAX_SAFE_INTEGER }),
				'int.type',
			],
			[
				decimalOperation,
				completeRecord({ amount: '99.99', count: 1 }),
				'decimal.precision',
			],
		] as const) {
			try {
				createFinalMutationValidationStage()({
					context,
					operation,
					previousOperation: operation,
					target,
				})
				expect.unreachable('Expected structural projection failure')
			} catch (error: unknown) {
				expect(readIssues(error)).toContainEqual(
					expect.objectContaining({ code }),
				)
			}
		}

		expect(intValidate).not.toHaveBeenCalled()
		expect(decimalValidate).not.toHaveBeenCalled()
	})

	it('requires exact targets for targetless upsert and set-based arithmetic', () => {
		const validate = vi.fn()
		const schema = Schema.define({
			className: 'RequiredArithmeticTargets',
			fields: (field) => ({
				score: field.int({
					required: true,
					validation: passThrough<number>(validate),
				}),
			}),
		})
		const query = new QueryBuilder(schema).where((where) =>
			where.eq('id', objectId),
		)
		const update = normalizeUpdateExpression(schema, { score: increment(1) })
		const upsertOne = immutableRecord({
			create: completeRecord({ score: 1 }),
			kind: 'upsert-one',
			query: query.ast,
			target: immutableRecord({
				fields: ['id'],
				kind: 'unique-upsert-target' as const,
			}),
			update,
		}) as unknown as UpsertOneOperationAst<typeof schema>
		const updateMany = immutableRecord({
			kind: 'update-many',
			query: query.ast,
			update,
		}) satisfies UpdateManyOperationAst<typeof schema>
		const upsertMany = immutableRecord({
			items: [
				immutableRecord({
					create: completeRecord({ score: 1 }),
					query: query.ast,
					target: upsertOne.target,
					update,
				}),
			],
			kind: 'upsert-many',
			selection: query.ast.selection,
			schema: query.ast.schema,
		}) as unknown as UpsertManyOperationAst<typeof schema>

		for (const [operation, target] of [
			[upsertOne, null],
			[updateMany, undefined],
			[upsertMany, undefined],
		] as const) {
			expect(() =>
				createFinalMutationValidationStage()({
					context,
					operation,
					previousOperation: operation,
					target,
				}),
			).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
		}
	})

	it('validates every prepared update-many target without rewriting the operation', async () => {
		const validate = vi.fn()
		const schema = Schema.define({
			className: 'PreparedBulkArithmetic',
			fields: (field) => ({
				score: field.int({
					required: true,
					validation: passThrough<number>(validate),
				}),
			}),
		})
		const operation = immutableRecord({
			kind: 'update-many',
			query: new QueryBuilder(schema).ast,
			update: normalizeUpdateExpression(schema, { score: decrement(2) }),
		}) satisfies UpdateManyOperationAst<typeof schema>

		const validated = await createFinalMutationValidationStage()({
			context,
			operation,
			previousOperation: operation,
			target: undefined,
			targets: [completeRecord({ score: 5 }), completeRecord({ score: 9 })],
		})

		expect(validate.mock.calls).toStrictEqual([[3], [7]])
		expect(validated).toMatchObject({
			update: {
				operations: [expect.objectContaining({ kind: 'decrement', value: 2 })],
			},
		})
	})
})

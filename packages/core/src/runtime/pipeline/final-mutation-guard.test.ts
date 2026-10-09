import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { createFixtureMasterContext } from '../../../tests/fixtures/master-context.js'
import { QueryBuilder } from '../../query/index.js'
import type {
	UpdateManyOperationAst,
	UpdateOneOperationAst,
} from '../../query/index.js'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	databasePersistencePlanCapability,
	type DatabaseMutationOperationAst,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type PreparedDatabaseOperation,
} from '../database/contracts.js'
import { createEnforcementState } from '../enforcement/state.js'
import type {
	RuntimeBehaviorStages,
	RuntimeEnforcementStages,
} from './contracts.js'
import { executeRuntimeDatabaseOperation } from './database-execution.js'
import { createPreparedOperationFixture } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { testDatabaseFilterOperators } from '../../../../../tooling/vitest/database-filter-operators.js'
import { UltimaBase } from '../application/ultima-base.js'

const Article = UltimaBase.Schema.define({
	className: 'FinalMutationGuardArticle',
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const updateOne = {
	kind: 'update-one',
	query: new QueryBuilder(Article).where((where) =>
		where.eq('id', '0198f090-2a50-7000-8000-000000000081'),
	).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'requested' }],
	},
} satisfies UpdateOneOperationAst<typeof Article>

const updateMany = {
	kind: 'update-many',
	query: new QueryBuilder(Article).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'requested' }],
	},
} satisfies UpdateManyOperationAst<typeof Article>

const target = immutableRecord({
	createdAt: '2026-09-02T00:00:00.000Z',
	id: '0198f090-2a50-7000-8000-000000000081',
	title: 'stored',
	updatedAt: '2026-09-02T00:00:00.000Z',
})

const unexpectedDirectExecution = <
	const TOperation extends DatabaseOperationAst,
>(): Promise<DatabaseOperationResult<TOperation>> =>
	Promise.reject(new TypeError('Unexpected direct execution'))

describe('final mutation-input guard', () => {
	it('runs for Master after final validation and before reevaluation', async () => {
		const trace: string[] = []
		const master = createFixtureMasterContext(
			'final mutation guard verification',
			'migration',
			RequestContext.anonymous({
				requestId: 'final-mutation-guard-master',
				source: requestSources.internal,
			}),
		)
		const transaction: DatabaseTransactionAdapter = {
			capabilities: {
				filterOperators: testDatabaseFilterOperators,
				persistencePlans: databasePersistencePlanCapability,
			},
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>() => {
				trace.push('database:prepare')
				return Promise.resolve(
					createPreparedOperationFixture<TOperation>({
						execute: () =>
							Promise.resolve(
								target as unknown as DatabaseOperationResult<TOperation>,
							),
						onExecute: () => {
							trace.push('database:execute')
						},
						target,
					}),
				)
			},
			execute: unexpectedDirectExecution,
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const state = createEnforcementState()
		const reevaluated = createEnforcementState()
		const enforcement: RuntimeEnforcementStages = {
			evaluate: () => state,
			reevaluate: (input) => {
				trace.push('enforcement:reevaluate')
				expect(input.enforcement).toBe(state)
				return reevaluated
			},
			enforceOperation: (input) => {
				trace.push('enforcement:operation')
				return { operation: input.operation }
			},
			enforceSelectionResult: (input) => input.result,
			enforceResult: (input) => input.result,
			enforcePreparedMutation: () => {
				trace.push('enforcement:prepared')
			},
		}
		const behaviors: RuntimeBehaviorStages = {
			transformInput: (input) => {
				trace.push('behavior:transformInput')
				return immutableRecord({ ...input.operation })
			},
			transformPreparedInput: (input) => {
				trace.push('behavior:transformPreparedInput')
				return input.operation
			},
			transformPreparedOperation: (input) => {
				trace.push('behavior:transformPreparedOperation')
				return input.operation
			},
			guardMutationInput: (input) => {
				trace.push('behavior:guardMutationInput')
				expect(input.context).toBe(master)
				expect(input.operation).not.toBe(updateOne)
				expect(input.target).toBe(target)
				expect(Object.isFrozen(input)).toBe(true)
			},
			beforeOperation: () => {
				trace.push('behavior:beforeOperation')
			},
			observePreparedMutation: () => {
				trace.push('behavior:observePreparedMutation')
			},
		}

		await executeRuntimeDatabaseOperation(
			transaction,
			master,
			behaviors,
			undefined,
			{ operation: updateOne },
			(input) => {
				trace.push('final-validation')
				return input.operation
			},
			enforcement,
			state,
		)

		expect(trace).toStrictEqual([
			'database:prepare',
			'enforcement:prepared',
			'behavior:transformInput',
			'behavior:transformPreparedInput',
			'behavior:transformPreparedOperation',
			'final-validation',
			'behavior:guardMutationInput',
			'enforcement:reevaluate',
			'enforcement:operation',
			'enforcement:prepared',
			'behavior:beforeOperation',
			'behavior:observePreparedMutation',
			'database:execute',
		])
	})

	it('receives complete stable targets requested by a behavior', async () => {
		const targets = immutableArray([
			target,
			immutableRecord({
				...target,
				id: '0198f090-2a50-7000-8000-000000000082',
				title: 'second',
			}),
		])
		let preparedRequest: DatabaseOperationRequest | undefined
		let guardedTargets: readonly unknown[] | undefined
		const transaction: DatabaseTransactionAdapter = {
			capabilities: {
				filterOperators: testDatabaseFilterOperators,
				persistencePlans: databasePersistencePlanCapability,
			},
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>(
				request: DatabaseOperationRequest<TOperation>,
			): Promise<PreparedDatabaseOperation<TOperation>> => {
				preparedRequest = request
				return Promise.resolve(
					immutableRecord({
						execute: () =>
							Promise.resolve(
								immutableRecord({
									materializations: immutableArray([]),
									result: immutableArray([]),
								}),
							),
						targets,
					}) as unknown as PreparedDatabaseOperation<TOperation>,
				)
			},
			execute: unexpectedDirectExecution,
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}
		const context = RequestContext.anonymous({
			requestId: 'final-mutation-guard-targets',
			source: requestSources.internal,
		})

		await executeRuntimeDatabaseOperation(
			transaction,
			context,
			{
				guardMutationInput: (input) => {
					guardedTargets = input.targets
					expect(input.target).toBeUndefined()
				},
				requiresPreparedMutationItems: () => true,
			},
			undefined,
			{ operation: updateMany },
			(input) => input.operation,
			undefined,
			undefined,
		)

		expect(preparedRequest?.prepareMutationItems).toBe(true)
		expect(guardedTargets).toStrictEqual(targets)
		expect(guardedTargets?.[0]).toBe(target)
		expect(Object.isFrozen(guardedTargets)).toBe(true)
	})

	it('stops before persistence when a guard cancels the request', async () => {
		const controller = new AbortController()
		const context = RequestContext.anonymous({
			requestId: 'final-mutation-guard-cancelled',
			signal: controller.signal,
			source: requestSources.internal,
		})
		let executeCalls = 0
		const transaction: DatabaseTransactionAdapter = {
			capabilities: {
				filterOperators: testDatabaseFilterOperators,
				persistencePlans: databasePersistencePlanCapability,
			},
			kind: 'database-transaction-adapter',
			prepare: <const TOperation extends DatabaseMutationOperationAst>() =>
				Promise.resolve(
					createPreparedOperationFixture<TOperation>({
						execute: () => {
							executeCalls += 1
							return Promise.resolve(
								target as unknown as DatabaseOperationResult<TOperation>,
							)
						},
						target,
					}),
				),
			execute: unexpectedDirectExecution,
			commit: () => Promise.resolve(),
			rollback: () => Promise.resolve(),
		}

		await expect(
			executeRuntimeDatabaseOperation(
				transaction,
				context,
				{
					guardMutationInput: () => {
						controller.abort()
					},
				},
				undefined,
				{ operation: updateOne },
				(input) => input.operation,
				undefined,
				undefined,
			),
		).rejects.toMatchObject({
			code: 'OPERATION_CANCELLED',
			internalDetails: { phase: 'final-mutation-input-guard' },
		})
		expect(executeCalls).toBe(0)
	})
})

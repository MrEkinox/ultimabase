import {
	type DatabaseMutationMaterialization,
	type DatabaseMutationOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type PreparedDatabaseOperation,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { PreparedMutationTestAdapter } from '../../../tooling/vitest/prepared-mutation-adapter.js'

export const schemaMutationHookId = '0199325a-0c00-7000-8000-000000000261'
const previousRow = immutableRecord({
	createdAt: '2026-09-10T00:00:00.000Z',
	id: schemaMutationHookId,
	title: 'Release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState: 'published',
})
const currentRow = immutableRecord({
	...previousRow,
	workflowState: 'archived',
})

const prepareSchemaMutationHook = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	request: DatabaseOperationRequest<TOperation>,
	trace: string[],
): Promise<PreparedDatabaseOperation<TOperation>> => {
	const operation: unknown = request.operation
	if (isPlainRecord(operation) && operation.kind === 'create-one') {
		if (!isPlainRecord(operation.input)) {
			throw new TypeError('Nested Hook create input must be a record')
		}
		const created = immutableRecord({
			...operation.input,
			createdAt: '2026-09-10T00:00:00.000Z',
			id: '0199325a-0c00-7000-8000-000000000262',
			updatedAt: '2026-09-10T00:00:00.000Z',
		})
		const create = immutableRecord({
			execute: () => {
				trace.push('execute:create-one')
				return Promise.resolve(
					immutableRecord({
						materializations: immutableArray([
							immutableRecord({
								current: created,
								kind: 'create' as const,
							}),
						]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
						result: created as unknown as DatabaseOperationResult<TOperation>,
					}),
				)
			},
		})
		return Promise.resolve(
			create as unknown as PreparedDatabaseOperation<TOperation>,
		)
	}

	let attempted = false
	const prepared = immutableRecord({
		target: previousRow,
		execute: (
			execution?: Readonly<{
				readonly operation: DatabaseMutationOperationAst
			}>,
		) => {
			if (attempted) {
				throw new TypeError('Prepared fixture mutation already executed')
			}
			attempted = true
			const kind = execution?.operation.kind
			trace.push(`execute:${String(kind)}`)
			if (kind === 'delete-one') {
				return Promise.resolve(
					immutableRecord({
						materializations: immutableArray([
							immutableRecord({
								kind: 'delete' as const,
								previous: previousRow,
							}),
						]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
						result: immutableRecord({
							id: previousRow.id,
							title: previousRow.title,
							workflowState: previousRow.workflowState,
						}) as unknown as DatabaseOperationResult<TOperation>,
					}),
				)
			}
			if (kind !== 'update-one') {
				throw new TypeError(
					'Schema mutation Hook fixture received an invalid effect',
				)
			}
			return Promise.resolve(
				immutableRecord({
					materializations: immutableArray([
						immutableRecord({
							current: currentRow,
							kind: 'update' as const,
							previous: previousRow,
						}),
					]) as unknown as readonly DatabaseMutationMaterialization<TOperation>[],
					result: immutableRecord({
						id: currentRow.id,
						title: currentRow.title,
						workflowState: currentRow.workflowState,
					}) as unknown as DatabaseOperationResult<TOperation>,
				}),
			)
		},
	})

	return Promise.resolve(
		prepared as unknown as PreparedDatabaseOperation<TOperation>,
	)
}

/** Records the exact transaction boundary around one custom mutation. */
export class SchemaMutationHookAdapter extends PreparedMutationTestAdapter {
	constructor(trace: string[]) {
		super({
			description: 'Schema mutation Hook fixture',
			prepare: (request) => prepareSchemaMutationHook(request, trace),
			trace,
		})
	}
}

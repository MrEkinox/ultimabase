import type {
	DatabaseLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationOutcome,
	DatabasePersistencePlan,
	PreparedDatabaseOperation,
	PreparedDatabaseOperationExecution,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'
import type { SQL } from 'drizzle-orm'

import { readPostgresPreparedOperation } from './persistence-plan.js'

export type PreparedMutationConstraintCompiler<
	TOperation extends DatabaseMutationOperationAst,
> = (request: PreparedDatabaseOperationExecution<TOperation>) => SQL | undefined

type PreparedMutationExecution<
	TOperation extends DatabaseMutationOperationAst,
> = (
	operation: TOperation,
	plan: DatabasePersistencePlan,
	constraint: SQL | undefined,
) => Promise<DatabaseOperationOutcome<TOperation>>

interface PreparedMutationHandleOptions<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly assertActive: () => void
	readonly compileConstraint: PreparedMutationConstraintCompiler<TOperation>
	readonly initialConstraint: SQL | undefined
	readonly operation: TOperation
	readonly plan: DatabasePersistencePlan
	readonly target?: DatabaseLogicalRecord | null
	readonly targets?: readonly DatabaseLogicalRecord[]
	readonly execute: PreparedMutationExecution<TOperation>
}

/** Creates one transaction-bound handle that consumes its target on first use. */
export const createPreparedMutationHandle = <
	const TOperation extends DatabaseMutationOperationAst,
>({
	assertActive,
	compileConstraint,
	initialConstraint,
	operation,
	plan,
	target,
	targets,
	execute,
}: PreparedMutationHandleOptions<TOperation>): PreparedDatabaseOperation<TOperation> => {
	let attempted = false
	const handle = {
		...(target === undefined ? {} : { target }),
		...(targets === undefined ? {} : { targets: immutableArray(targets) }),
		execute: async (
			request?: PreparedDatabaseOperationExecution<TOperation>,
		): Promise<DatabaseOperationOutcome<TOperation>> => {
			if (attempted) {
				throw new TypeError(
					'PostgreSQL prepared mutation has already been executed',
				)
			}

			// Failed and expired attempts consume the retained target as well.
			attempted = true
			assertActive()
			const resolvedOperation = request?.operation ?? operation
			const resolvedPlan = request?.plan ?? plan

			if (
				resolvedPlan.target.schema.definition !== plan.target.schema.definition
			) {
				throw new TypeError(
					'PostgreSQL prepared plan changed its target schema',
				)
			}
			const physicalOperation = readPostgresPreparedOperation(
				resolvedOperation,
				resolvedPlan,
			)

			return execute(
				physicalOperation as unknown as TOperation,
				resolvedPlan,
				request === undefined ? initialConstraint : compileConstraint(request),
			)
		},
	}

	// Runtime narrowing restores the exact conditional target contract.
	return Object.freeze(
		handle,
	) as unknown as PreparedDatabaseOperation<TOperation>
}

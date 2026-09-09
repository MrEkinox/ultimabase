import type {
	DatabaseOperationAst,
	DatabasePersistencePlan,
	ExecutableOperationAst,
	QueryAst,
	QuerySelectionNode,
} from '@ultimabase/core'
import { databasePersistencePlanVersion } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Replaces a logical result projection with Core's persisted adapter projection. */
const projectPersistenceQuery = (
	query: QueryAst,
	selection: QuerySelectionNode,
): QueryAst => immutableRecord({ ...query, selection })

/** Converts the portable physical protocol into the existing Drizzle operation compiler input. */
export const readPostgresPersistenceOperation = (
	logicalOperation: DatabaseOperationAst,
	plan: DatabasePersistencePlan,
): ExecutableOperationAst => {
	const candidate: unknown = plan
	if (
		!isPlainRecord(candidate) ||
		candidate.version !== databasePersistencePlanVersion
	) {
		throw new TypeError(
			'PostgreSQL received an unsupported persistence protocol',
		)
	}
	if (plan.returning.operationKind !== logicalOperation.kind) {
		throw new TypeError(
			'PostgreSQL persistence result contract does not match the logical operation',
		)
	}

	const selected = {
		selection: plan.returning.selection,
		schema: plan.target.schema,
	}
	const projectQuery = (query: QueryAst): QueryAst =>
		projectPersistenceQuery(query, plan.returning.selection)
	let operation: unknown

	switch (plan.kind) {
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
			operation = immutableRecord({
				kind: plan.kind,
				query: projectQuery(plan.data.query),
			})
			break
		case 'get':
			operation = immutableRecord({
				id: plan.data.id,
				kind: plan.kind,
				query: projectQuery(plan.data.query),
			})
			break
		case 'create-one':
			operation = immutableRecord({
				...selected,
				inclusion: plan.returning.inclusion,
				input: plan.data.input,
				kind: plan.kind,
			})
			break
		case 'create-many':
			operation = immutableRecord({
				...selected,
				inputs: plan.data.inputs,
				kind: plan.kind,
			})
			break
		case 'update-many':
		case 'update-one':
			operation = immutableRecord({
				kind: plan.kind,
				query: projectQuery(plan.data.query),
				update: plan.data.update,
			})
			break
		case 'upsert-one':
			operation = immutableRecord({
				create: plan.data.create,
				kind: plan.kind,
				query: projectQuery(plan.data.query),
				target: plan.data.uniqueTarget,
				update: plan.data.update,
			})
			break
		case 'upsert-many':
			operation = immutableRecord({
				...selected,
				items: plan.data.items.map((item) =>
					immutableRecord({
						create: item.create,
						query: projectQuery(item.query),
						target: item.uniqueTarget,
						update: item.update,
					}),
				),
				kind: plan.kind,
			})
			break
	}

	return operation as ExecutableOperationAst
}

/**
 * Preserves logical delete semantics while compiling prepared mutation queries
 * and result projections from Core's physical returning contract.
 */
export const readPostgresPreparedOperation = (
	logicalOperation: DatabaseOperationAst,
	plan: DatabasePersistencePlan,
): ExecutableOperationAst => {
	const physicalOperation = readPostgresPersistenceOperation(
		logicalOperation,
		plan,
	)

	if (physicalOperation.kind === logicalOperation.kind) {
		return physicalOperation
	}
	if (
		logicalOperation.kind === 'delete-one' &&
		physicalOperation.kind === 'update-one'
	) {
		return immutableRecord({
			kind: 'delete-one' as const,
			query: physicalOperation.query,
		})
	}
	if (
		logicalOperation.kind === 'delete-many' &&
		physicalOperation.kind === 'update-many'
	) {
		return immutableRecord({
			kind: 'delete-many' as const,
			query: physicalOperation.query,
		})
	}

	throw new TypeError(
		'PostgreSQL prepared persistence plan changed the logical mutation kind',
	)
}

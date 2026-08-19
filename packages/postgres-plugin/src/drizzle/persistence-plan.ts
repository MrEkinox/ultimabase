import type {
	DatabaseOperationAst,
	DatabasePersistencePlan,
	ExecutableOperationAst,
} from '@ultimabase/core'
import { databasePersistencePlanVersion } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

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
	let operation: unknown

	switch (plan.kind) {
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
			operation = immutableRecord({ kind: plan.kind, query: plan.data.query })
			break
		case 'get':
			operation = immutableRecord({
				id: plan.data.id,
				kind: plan.kind,
				query: plan.data.query,
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
				query: plan.data.query,
				update: plan.data.update,
			})
			break
		case 'upsert-one':
			operation = immutableRecord({
				create: plan.data.create,
				kind: plan.kind,
				query: plan.data.query,
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
						query: item.query,
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

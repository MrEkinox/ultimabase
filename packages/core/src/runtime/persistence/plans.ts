import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	ExecutableOperationAst,
	UpdateExpressionNode,
} from '../../query/index.js'
import {
	readOperationResultInclusion,
	readOperationResultSelection,
} from '../operations/queries.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import {
	databasePersistencePlanVersion,
	type DatabasePersistencePlan,
	type DatabasePersistenceProvenance,
	type PersistenceLogicalOperationAst,
} from './contracts.js'

const canonicalPersistenceProvenance: DatabasePersistenceProvenance =
	immutableRecord({
		contributionId: 'canonical-persistence-plan',
		owner: immutableRecord({ pluginId: '@ultimabase/core' }),
		pluginVersion: '0.0.0',
		protocolVersion: databasePersistencePlanVersion,
	})

const readLogicalOperationSchema = (operation: ExecutableOperationAst) => {
	switch (operation.kind) {
		case 'create-many':
		case 'create-one':
		case 'upsert-many':
			return operation.schema
		default:
			return operation.query.schema
	}
}

/** Copies only the statement facts each physical plan kind carries. */
const readPersistenceData = (
	operation: ExecutableOperationAst,
): Readonly<Record<string, unknown>> => {
	switch (operation.kind) {
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
			return immutableRecord({ query: operation.query })
		case 'get':
			return immutableRecord({ id: operation.id, query: operation.query })
		case 'create-one':
			return immutableRecord({ input: operation.input })
		case 'create-many':
			return immutableRecord({ inputs: immutableArray(operation.inputs) })
		case 'update-many':
		case 'update-one':
			return immutableRecord({
				query: operation.query,
				update: operation.update,
			})
		case 'upsert-one':
			return immutableRecord({
				create: operation.create,
				query: operation.query,
				uniqueTarget: operation.target,
				update: operation.update,
			})
		case 'upsert-many':
			return immutableRecord({
				items: immutableArray(
					operation.items.map((item) =>
						immutableRecord({
							create: item.create,
							query: item.query,
							uniqueTarget: item.target,
							update: item.update,
						}),
					),
				),
			})
	}
}

const createDatabasePersistencePlanInternal = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	returningSelection?: ReturnType<typeof readOperationResultSelection>,
): DatabasePersistencePlan<TOperation> => {
	const executable = operation as unknown as ExecutableOperationAst
	const plan: unknown = immutableRecord({
		provenance: immutableArray([canonicalPersistenceProvenance]),
		returning: immutableRecord({
			inclusion: readOperationResultInclusion(executable),
			operationKind: operation.kind,
			selection: returningSelection ?? readOperationResultSelection(executable),
		}),
		target: immutableRecord({ schema: readLogicalOperationSchema(executable) }),
		version: databasePersistencePlanVersion,
		data: readPersistenceData(executable),
		kind: executable.kind,
	})
	// The operation kind selects the matching data shape built above.
	return plan as DatabasePersistencePlan<TOperation>
}

/** Compiles one immutable physical statement without exposing protected constraints. */
export const createDatabasePersistencePlan = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
): DatabasePersistencePlan<TOperation> =>
	createDatabasePersistencePlanInternal(operation)

/** Compiles Core's private result projection without widening the public plan factory. */
export const createDatabasePersistencePlanWithSelection = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	returningSelection: ReturnType<typeof readOperationResultSelection>,
): DatabasePersistencePlan<TOperation> =>
	createDatabasePersistencePlanInternal(operation, returningSelection)

/** Replaces one logical delete with an update while retaining target and result identity. */
export const rewriteDeletePersistencePlan = <
	const TOperation extends DatabaseOperationAst,
>(
	plan: DatabasePersistencePlan<TOperation>,
	update: UpdateExpressionNode,
): DatabasePersistencePlan<TOperation> => {
	if (plan.kind !== 'delete-one' && plan.kind !== 'delete-many') {
		throw new TypeError('Delete persistence rewrites require a delete plan')
	}

	return immutableRecord({
		...plan,
		data: immutableRecord({ query: plan.data.query, update }),
		kind: plan.kind === 'delete-one' ? 'update-one' : 'update-many',
	})
}

const assertUpdateExpression = (value: unknown): void => {
	if (
		!isPlainRecord(value) ||
		value.kind !== 'update-expression' ||
		!isUnknownArray(value.operations) ||
		value.operations.length === 0
	) {
		throw new TypeError(
			'Persistence update data must contain a normalized update expression',
		)
	}
}

/** Validates a plugin result and appends owner provenance under Core control. */
export const acceptDatabasePersistenceRewrite = <
	const TPhysicalOperation extends DatabaseOperationAst,
>(
	logicalOperation: PersistenceLogicalOperationAst,
	previous: DatabasePersistencePlan<TPhysicalOperation>,
	candidate: unknown,
	provenance: Readonly<{
		contributionId: string
		owner: PluginIdentity
		pluginVersion: string
	}>,
): DatabasePersistencePlan<TPhysicalOperation> => {
	if (!isPlainRecord(candidate)) {
		throw new TypeError('Persistence plan rewriters must return a plain object')
	}
	if (candidate.version !== databasePersistencePlanVersion) {
		throw new TypeError(
			`Persistence plan rewriters must return protocol version ${String(databasePersistencePlanVersion)}`,
		)
	}
	if (candidate.target !== previous.target) {
		throw new TypeError(
			'Persistence plan rewriters cannot change the logical target schema',
		)
	}
	if (candidate.returning !== previous.returning) {
		throw new TypeError(
			'Persistence plan rewriters cannot change the logical result contract',
		)
	}
	if (candidate.provenance !== previous.provenance) {
		throw new TypeError(
			'Persistence plan provenance is owned by Core and cannot be replaced',
		)
	}

	const allowedKind =
		candidate.kind === previous.kind ||
		(logicalOperation.kind === 'delete-one' &&
			candidate.kind === 'update-one') ||
		(logicalOperation.kind === 'delete-many' &&
			candidate.kind === 'update-many')
	if (!allowedKind) {
		throw new TypeError(
			`Persistence protocol version ${String(databasePersistencePlanVersion)} cannot rewrite ${logicalOperation.kind} as ${String(candidate.kind)}`,
		)
	}
	if (candidate.kind === previous.kind && candidate.data !== previous.data) {
		throw new TypeError(
			`Persistence protocol version ${String(databasePersistencePlanVersion)} only permits delete plans to become update plans`,
		)
	}
	if (candidate.kind !== previous.kind) {
		if (
			!isPlainRecord(candidate.data) ||
			candidate.data.query !==
				('query' in logicalOperation ? logicalOperation.query : undefined)
		) {
			throw new TypeError(
				'Persistence plan rewriters cannot change the logical target query',
			)
		}
		assertUpdateExpression(candidate.data.update)
	}

	return immutableRecord({
		...candidate,
		provenance: immutableArray([
			...previous.provenance,
			immutableRecord({
				contributionId: provenance.contributionId,
				owner: immutableRecord(provenance.owner),
				pluginVersion: provenance.pluginVersion,
				protocolVersion: databasePersistencePlanVersion,
			}),
		]),
	}) as unknown as DatabasePersistencePlan<TPhysicalOperation>
}

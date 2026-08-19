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

/** Compiles one immutable physical statement without exposing protected constraints. */
export const createDatabasePersistencePlan = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
): DatabasePersistencePlan<TOperation> => {
	const executable = operation as unknown as ExecutableOperationAst
	const base = {
		provenance: immutableArray([canonicalPersistenceProvenance]),
		returning: immutableRecord({
			inclusion: readOperationResultInclusion(executable),
			operationKind: operation.kind,
			selection: readOperationResultSelection(executable),
		}),
		target: immutableRecord({ schema: readLogicalOperationSchema(executable) }),
		version: databasePersistencePlanVersion,
	}
	let plan: unknown

	switch (executable.kind) {
		case 'count':
		case 'delete-many':
		case 'delete-one':
		case 'exists':
		case 'find-many':
		case 'find-one':
			plan = immutableRecord({
				...base,
				data: immutableRecord({ query: executable.query }),
				kind: executable.kind,
			})
			break
		case 'get':
			plan = immutableRecord({
				...base,
				data: immutableRecord({ id: executable.id, query: executable.query }),
				kind: executable.kind,
			})
			break
		case 'create-one':
			plan = immutableRecord({
				...base,
				data: immutableRecord({ input: executable.input }),
				kind: executable.kind,
			})
			break
		case 'create-many':
			plan = immutableRecord({
				...base,
				data: immutableRecord({ inputs: immutableArray(executable.inputs) }),
				kind: executable.kind,
			})
			break
		case 'update-many':
		case 'update-one':
			plan = immutableRecord({
				...base,
				data: immutableRecord({
					query: executable.query,
					update: executable.update,
				}),
				kind: executable.kind,
			})
			break
		case 'upsert-one':
			plan = immutableRecord({
				...base,
				data: immutableRecord({
					create: executable.create,
					query: executable.query,
					uniqueTarget: executable.target,
					update: executable.update,
				}),
				kind: executable.kind,
			})
			break
		case 'upsert-many':
			plan = immutableRecord({
				...base,
				data: immutableRecord({
					items: immutableArray(
						executable.items.map((item) =>
							immutableRecord({
								create: item.create,
								query: item.query,
								uniqueTarget: item.target,
								update: item.update,
							}),
						),
					),
				}),
				kind: executable.kind,
			})
			break
	}

	return plan as DatabasePersistencePlan<TOperation>
}

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
	const TOperation extends DatabaseOperationAst,
>(
	logicalOperation: TOperation,
	previous: DatabasePersistencePlan<TOperation>,
	candidate: unknown,
	provenance: Readonly<{
		contributionId: string
		owner: PluginIdentity
		pluginVersion: string
	}>,
): DatabasePersistencePlan<TOperation> => {
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
			`Persistence protocol version 1 cannot rewrite ${logicalOperation.kind} as ${String(candidate.kind)}`,
		)
	}
	if (candidate.kind === previous.kind && candidate.data !== previous.data) {
		throw new TypeError(
			'Persistence protocol version 1 only permits delete plans to become update plans',
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
	}) as unknown as DatabasePersistencePlan<TOperation>
}

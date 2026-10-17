import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
} from '../database/contracts.js'
import {
	databasePersistencePlanVersion,
	type DatabasePersistencePlan,
	type PersistenceLogicalOperationAst,
	type RuntimePersistencePlanRewriteStage,
} from './contracts.js'
import {
	createDatabasePersistencePlan,
	createDatabasePersistencePlanWithSelection,
} from './plans.js'
import type { QuerySelectionNode } from '../../query/index.js'

/** Builds Core's canonical plan, optionally with a private result projection. */
const createCanonicalPlan = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
	returningSelection: QuerySelectionNode | undefined,
): DatabasePersistencePlan<TOperation> =>
	returningSelection === undefined
		? createDatabasePersistencePlan(operation)
		: createDatabasePersistencePlanWithSelection(operation, returningSelection)

/** Attaches the canonical physical plan to one Core-owned internal request. */
export const createDatabasePersistenceRequest = <
	const TOperation extends DatabaseOperationAst,
>(
	request: Omit<DatabaseOperationRequest<TOperation>, 'plan'>,
	returningSelection?: QuerySelectionNode,
): DatabaseOperationRequest<TOperation> =>
	immutableRecord({
		...request,
		plan: createCanonicalPlan(request.operation, returningSelection),
	})

/** Rejects missing protocol or statement support before an adapter effect. */
export const assertPersistencePlanCapability = (
	executor: DatabaseOperationExecutor,
	plan: DatabasePersistencePlan,
): void => {
	const capability: unknown = executor.capabilities?.persistencePlans

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'persistence-plans' ||
		capability.version !== databasePersistencePlanVersion ||
		!isUnknownArray(capability.kinds) ||
		!capability.kinds.includes(plan.kind)
	) {
		throw new FrameworkError(
			'PLUGIN_PROTOCOL_INCOMPATIBLE',
			`Database adapter does not support persistence plan "${plan.kind}" at protocol version ${String(databasePersistencePlanVersion)}.`,
			{
				publicMessage: 'The database operation is not available.',
				internalDetails: {
					kind: 'persistence-plan-capability-missing',
					planKind: plan.kind,
					protocolVersion: databasePersistencePlanVersion,
				},
			},
		)
	}
}

/**
 * Compiles and authorizes the final physical plan without exposing constraints.
 * Rewriters observe the logical operation: the physical one itself, or the
 * plugin schema mutation it carries out (ADR-0245, ADR-0344).
 */
export const compileDatabasePersistencePlan = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	operation: TOperation,
	rewrite: RuntimePersistencePlanRewriteStage | undefined,
	returningSelection?: QuerySelectionNode,
	logicalOperation: PersistenceLogicalOperationAst = operation,
): Promise<DatabasePersistencePlan<TOperation>> => {
	const canonical = createCanonicalPlan(operation, returningSelection)
	const plan =
		rewrite === undefined
			? canonical
			: await rewrite({ logicalOperation, plan: canonical })

	assertPersistencePlanCapability(executor, plan)
	return plan
}

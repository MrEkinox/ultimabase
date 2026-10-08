import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import {
	createQueryAst,
	type ExecutableOperationAst,
	type QuerySelectionNode,
} from '../../query/index.js'
import {
	databaseInclusionCapabilityVersion,
	type DatabaseInclusionPlan,
	type DatabaseMutationMaterializationSource,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseOperationResult,
} from '../database/contracts.js'
import {
	readOperationResultInclusion,
	readOperationResultSelection,
} from '../operations/queries.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import { emptyRuntimeConstraints } from './stage-inputs.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/** Rejects eager loading unless the adapter implements the complete side channel. */
export const assertDatabaseInclusionCapability = (
	executor: DatabaseOperationExecutor,
): void => {
	const capability: unknown = executor.capabilities?.inclusions

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'inclusions' ||
		capability.version !== databaseInclusionCapabilityVersion ||
		typeof executor.readIncludedValue !== 'function'
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement inclusion capability version ${String(databaseInclusionCapabilityVersion)}.`,
			{ publicMessage: 'Relationship inclusion is not available.' },
		)
	}
}

/** Loads eager relationship source values without replaying the root pipeline. */
export const loadSingularMutationInclusionSource = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	operation: TOperation,
	outcome: DatabaseMutationMaterializationSource,
	inclusions: readonly DatabaseInclusionPlan[] | undefined,
	returningSelection?: QuerySelectionNode,
): Promise<DatabaseOperationResult<TOperation> | undefined> => {
	if (
		inclusions === undefined ||
		(operation.kind !== 'create-one' && operation.kind !== 'update-one')
	) {
		return undefined
	}

	const materialization = outcome.materializations[0]
	if (materialization === undefined || !('current' in materialization)) {
		return undefined
	}
	const identity =
		executor.readObjectIdentity?.(materialization.current) ??
		materialization.current.id
	assertNonEmptyString(identity, 'Mutation projection object id')

	// The terminal discriminant proves the private read shape omitted by the adapter union.
	const executable = operation as unknown as Extract<
		ExecutableOperationAst,
		{ readonly kind: 'create-one' | 'update-one' }
	>
	const query =
		executable.kind === 'create-one'
			? createQueryAst(executable.schema.definition)
			: executable.query
	const projected: unknown = await executor.execute(
		createDatabasePersistenceRequest(
			{
				constraints: emptyRuntimeConstraints,
				inclusions,
				operation: immutableRecord({
					id: identity,
					kind: 'get' as const,
					query: immutableRecord({
						...query,
						inclusion: readOperationResultInclusion(executable),
						selection: readOperationResultSelection(executable),
						// The persisted identity is authoritative even when an update changes its predicate.
						where: undefined,
					}),
				}),
			},
			returningSelection,
		),
	)

	assertPlainObject(
		projected,
		'Mutation inclusion projection must return one record',
	)

	// The private get uses the same schema and projection as the singular mutation.
	return projected as DatabaseOperationResult<TOperation>
}

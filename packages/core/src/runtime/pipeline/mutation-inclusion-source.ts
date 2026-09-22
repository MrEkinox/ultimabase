import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import {
	createQueryAst,
	type ExecutableOperationAst,
	type GetOperationAst,
	type QuerySelectionNode,
} from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type {
	DatabaseInclusionPlan,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import {
	readOperationResultInclusion,
	readOperationResultSelection,
} from '../operations/queries.js'
import { createDatabasePersistenceRequest } from '../persistence/execution.js'
import { emptyRuntimeConstraints } from './stage-inputs.js'

/** Builds one private id read from the exact public mutation projection. */
const createMutationInclusionRead = (
	operation: Extract<
		ExecutableOperationAst,
		{ readonly kind: 'create-one' | 'update-one' }
	>,
	id: string,
): GetOperationAst<SchemaDefinition> => {
	const query =
		operation.kind === 'create-one'
			? createQueryAst(operation.schema.definition)
			: operation.query

	return immutableRecord({
		id,
		kind: 'get' as const,
		query: immutableRecord({
			...query,
			inclusion: readOperationResultInclusion(operation),
			selection: readOperationResultSelection(operation),
			// The persisted identity is authoritative even when an update changes its predicate.
			where: undefined,
		}),
	})
}

/** Reads one persisted identity from private mutation materialization data. */
const readMutationProjectionIdentity = (
	executor: DatabaseOperationExecutor,
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst>,
): string | undefined => {
	const materialization = outcome.materializations[0]

	if (materialization === undefined || !('current' in materialization)) {
		return undefined
	}

	const identity =
		executor.readObjectIdentity?.(materialization.current) ??
		materialization.current.id

	assertNonEmptyString(identity, 'Mutation projection object id')

	return identity
}

/** Loads eager relationship source values without replaying the root pipeline. */
export const loadSingularMutationInclusionSource = async <
	const TOperation extends DatabaseOperationAst,
>(
	executor: DatabaseOperationExecutor,
	operation: TOperation,
	outcome: DatabaseOperationOutcome<DatabaseMutationOperationAst>,
	inclusions: readonly DatabaseInclusionPlan[] | undefined,
	returningSelection?: QuerySelectionNode,
): Promise<DatabaseOperationResult<TOperation> | undefined> => {
	if (
		inclusions === undefined ||
		(operation.kind !== 'create-one' && operation.kind !== 'update-one')
	) {
		return undefined
	}

	const identity = readMutationProjectionIdentity(executor, outcome)

	if (identity === undefined) return undefined

	// The terminal discriminant proves the private read shape omitted by the adapter union.
	const executable = operation as unknown as Extract<
		ExecutableOperationAst,
		{ readonly kind: 'create-one' | 'update-one' }
	>
	const projected: unknown = await executor.execute(
		createDatabasePersistenceRequest(
			{
				constraints: emptyRuntimeConstraints,
				inclusions,
				operation: createMutationInclusionRead(executable, identity),
			},
			returningSelection,
		),
	)

	if (!isPlainRecord(projected)) {
		throw new TypeError('Mutation inclusion projection must return one record')
	}

	// The private get uses the same schema and projection as the singular mutation.
	return projected as DatabaseOperationResult<TOperation>
}

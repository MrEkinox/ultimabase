import type { MaybePromise } from '@ultimabase/shared'

import type {
	ExecutableOperationAst,
	OperationKind,
	QueryFieldName,
} from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseConstraintNode,
	DatabaseOperationAst,
} from '../database/contracts.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'

export type { DatabaseConstraintNode } from '../database/contracts.js'

/** Names every monotonic effect accepted at Runtime's policy-neutral boundary. */
export type EnforcementContributionKind =
	| 'constraint'
	| 'guard'
	| 'restrictInput'
	| 'restrictOutput'
	| 'restrictSelection'

/** Identifies the three field sets that independent policies may only narrow. */
export type EnforcementFieldBoundary = 'input' | 'output' | 'selection'

/** Supplies an exact operation and trusted request authority to one enforcement callback. */
export interface EnforcementOperationInput<
	TOperation extends DatabaseOperationAst,
> {
	readonly context: RequestContext
	readonly operation: TOperation
}

/** Adds the exact transformed result only at the final output boundary. */
export interface EnforcementOutputInput<
	TOperation extends DatabaseOperationAst,
> extends EnforcementOperationInput<TOperation> {
	readonly result: RuntimeOperationResult<TOperation>
}

/** Resolves the schema-specific AST selected by a contribution declaration. */
export type EnforcementOperation<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = Extract<ExecutableOperationAst<TSchema>, { readonly kind: TOperationKind }>

/** Rejects by throwing and deliberately has no grant-shaped return value. */
export type EnforcementGuardHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: EnforcementOperationInput<
		EnforcementOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<void>

/** Appends opaque constraints without receiving accumulated state. */
export type EnforcementConstraintHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
	TConstraint extends DatabaseConstraintNode,
> = (
	input: EnforcementOperationInput<
		EnforcementOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<TConstraint | readonly TConstraint[]>

/** Returns the only schema fields this contribution permits at one boundary. */
export type EnforcementFieldRestrictionHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: EnforcementOperationInput<
		EnforcementOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<readonly QueryFieldName<TSchema>[]>

/** Narrows the final transformed result without allowing a value replacement. */
export type EnforcementOutputRestrictionHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: EnforcementOutputInput<EnforcementOperation<TSchema, TOperationKind>>,
) => MaybePromise<readonly QueryFieldName<TSchema>[]>

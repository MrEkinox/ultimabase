import type { MaybePromise } from '@ultimabase/shared'

import type {
	ExecutableOperationAst,
	QueryFieldName,
} from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type { DatabaseConstraintNode } from '../database/contracts.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeLogicalOperationKind,
	RuntimeOperationResult,
} from '../pipeline/contracts.js'
import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'

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
	TOperation extends RuntimeLogicalOperationAst,
> {
	readonly context: RequestContext
	readonly operation: TOperation
}

/** Adds the exact transformed result only at the final output boundary. */
export interface EnforcementOutputInput<
	TOperation extends RuntimeLogicalOperationAst,
> extends EnforcementOperationInput<TOperation> {
	readonly result: RuntimeOperationResult<TOperation>
}

/** Resolves the schema-specific AST selected by a contribution declaration. */
export type EnforcementOperation<
	TSchema extends SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind,
> = TOperationKind extends 'plugin-schema-mutation'
	? PluginSchemaMutationOperationAst
	: Extract<ExecutableOperationAst<TSchema>, { readonly kind: TOperationKind }>

/** Rejects by throwing and deliberately has no grant-shaped return value. */
export type EnforcementGuardHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind,
> = (
	input: EnforcementOperationInput<
		EnforcementOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<void>

/** Appends opaque constraints without receiving accumulated state. */
export type EnforcementConstraintHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind,
	TConstraint extends DatabaseConstraintNode,
> = (
	input: EnforcementOperationInput<
		EnforcementOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<TConstraint | readonly TConstraint[]>

/** Returns the only schema fields this contribution permits at one boundary. */
export type EnforcementFieldRestrictionHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind,
> = (
	input: EnforcementOperationInput<
		EnforcementOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<readonly QueryFieldName<TSchema>[]>

/** Narrows the final transformed result without allowing a value replacement. */
export type EnforcementOutputRestrictionHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind,
> = (
	input: EnforcementOutputInput<EnforcementOperation<TSchema, TOperationKind>>,
) => MaybePromise<readonly QueryFieldName<TSchema>[]>

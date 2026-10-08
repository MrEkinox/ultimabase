import type { MaybePromise } from '@ultimabase/shared'

import type { ExecutableOperationAst } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeLogicalOperationKind,
} from '../pipeline/contracts.js'
import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'

/** Names the executable enforcement definition kind; protected policies carry their own. */
export type EnforcementContributionKind = 'guard'

/** Identifies the two field sets that independent protected policies may only narrow. */
export type EnforcementFieldBoundary = 'input' | 'selection'

/** Supplies an exact operation and trusted request authority to one enforcement callback. */
export interface EnforcementOperationInput<
	TOperation extends RuntimeLogicalOperationAst,
> {
	readonly context: RequestContext
	readonly operation: TOperation
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

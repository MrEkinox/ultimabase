import type { SchemaDefinition } from '@ultimabase/core'
import type { GraphQLResolveInfo } from 'graphql'

import {
	prepareGraphqlReadOperation,
	type GraphqlReadNormalizationContext,
	type GraphqlReadOperation,
	type GraphqlReadOperationAst,
} from './read-normalization.js'

/** Keeps test assertions focused on the operation produced by the live preparation path. */
export const normalizeGraphqlReadOperation = <
	const TSchema extends SchemaDefinition,
	const TOperation extends GraphqlReadOperation,
>(
	schema: TSchema,
	operation: TOperation,
	args: unknown,
	info: GraphQLResolveInfo | undefined,
	context: GraphqlReadNormalizationContext,
): GraphqlReadOperationAst<TSchema, TOperation> =>
	prepareGraphqlReadOperation(schema, operation, args, info, context).operation

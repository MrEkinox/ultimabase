export type {
	WhereCallback,
	WhereInput,
	WhereLogicalKey,
	WhereSource,
} from './where-contracts.js'
export { WhereBuilder } from './where-builder.js'
export { normalizeWhereInput } from './where-normalize.js'
export { whereInputFromQueryFilter } from './where-serialize.js'
/** Resolves every supported public where form through the same object normalizer. */
export const resolveWhereInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: WhereSource<TSchema>,
): QueryFilterNode<TSchema> => resolveWhereBuilderInput(schema, input)
import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterNode } from './logical.js'
import { resolveWhereBuilderInput } from './where-builder.js'
import type { WhereSource } from './where-contracts.js'

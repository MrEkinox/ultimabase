import type {
	ExecutableOperationAst,
	QueryAst,
	QueryInclusionNode,
	QuerySelectionNode,
} from '../../query/index.js'
import { emptyQueryInclusion } from '../../query/clauses/inclusion.js'
import { immutableArray } from '@ultimabase/shared'

/** Reads every public QueryBuilder AST carried by one normalized executable operation. */
export const readOperationQueries = (
	operation: ExecutableOperationAst,
): readonly QueryAst[] => {
	if ('query' in operation) {
		return immutableArray([operation.query])
	}

	return operation.kind === 'upsert-many'
		? immutableArray(operation.items.map(({ query }) => query))
		: immutableArray([])
}

/** Reads the one normalized projection that shapes the public operation result. */
export const readOperationResultSelection = (
	operation: ExecutableOperationAst,
): QuerySelectionNode =>
	'query' in operation ? operation.query.selection : operation.selection

/** Reads the normalized relationship projection carried by one result operation. */
export const readOperationResultInclusion = (
	operation: ExecutableOperationAst,
): QueryInclusionNode =>
	'query' in operation
		? operation.query.inclusion
		: operation.kind === 'create-one'
			? (operation.inclusion ?? emptyQueryInclusion)
			: emptyQueryInclusion

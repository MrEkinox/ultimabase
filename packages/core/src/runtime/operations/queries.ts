import type { ExecutableOperationAst, QueryAst } from '../../query/index.js'
import { immutableArray } from '@ultimabase/shared'

/** Reads every public Query AST carried by one normalized executable operation. */
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

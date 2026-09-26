import type {
	ExecutableOperationAst,
	QueryAst,
	QueryInclusionNode,
	QuerySelectionNode,
} from '../../query/index.js'
import { emptyQueryInclusion } from '../../query/clauses/inclusion.js'
import { immutableArray } from '@ultimabase/shared'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'
import { isQueryBackedOperation } from './characteristics.js'

type RuntimeQueryOperationAst =
	DatabaseOperationAst | PluginSchemaMutationOperationAst

/** Reads every public QueryBuilder AST carried by one normalized executable operation. */
export const readOperationQueries = (
	operation: RuntimeQueryOperationAst,
): readonly QueryAst[] => {
	if (operation.kind === 'plugin-schema-mutation') {
		return immutableArray([operation.query])
	}
	// Structural validation proves the closed executable union before Runtime reads it.
	const executable = operation as unknown as ExecutableOperationAst
	if (isQueryBackedOperation(executable)) {
		return immutableArray([executable.query])
	}

	return executable.kind === 'upsert-many'
		? immutableArray(executable.items.map(({ query }) => query))
		: immutableArray([])
}

/** Reads the one normalized projection that shapes the public operation result. */
export const readOperationResultSelection = (
	operation: RuntimeQueryOperationAst,
): QuerySelectionNode => {
	if (operation.kind === 'plugin-schema-mutation')
		return operation.query.selection
	const executable = operation as unknown as ExecutableOperationAst
	return isQueryBackedOperation(executable)
		? executable.query.selection
		: executable.selection
}

/** Reads the normalized relationship projection carried by one result operation. */
export const readOperationResultInclusion = (
	operation: RuntimeQueryOperationAst,
): QueryInclusionNode => {
	if (operation.kind === 'plugin-schema-mutation')
		return operation.query.inclusion
	const executable = operation as unknown as ExecutableOperationAst
	return isQueryBackedOperation(executable)
		? executable.query.inclusion
		: executable.kind === 'create-one'
			? (executable.inclusion ?? emptyQueryInclusion)
			: emptyQueryInclusion
}

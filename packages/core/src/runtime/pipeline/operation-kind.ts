import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
} from '../database/contracts.js'

/** Narrows the closed terminal union before selecting the adapter protocol. */
export const isRuntimeMutationOperation = (
	operation: DatabaseOperationAst,
): operation is DatabaseMutationOperationAst => {
	switch (operation.kind) {
		case 'count':
		case 'exists':
		case 'find-many':
		case 'find-one':
		case 'get':
			return false
		case 'create-many':
		case 'create-one':
		case 'delete-many':
		case 'delete-one':
		case 'update-many':
		case 'update-one':
		case 'upsert-many':
		case 'upsert-one':
			return true
	}
}

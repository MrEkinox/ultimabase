import type { DatabaseOperationAst } from '../database/contracts.js'

/** Classifies the closed operation union before Runtime opens an adapter transaction. */
export const requiresAutomaticMutationTransaction = (
	operation: DatabaseOperationAst,
): boolean => {
	switch (operation.kind) {
		case 'find-many':
		case 'find-one':
		case 'get':
		case 'count':
		case 'exists':
			return false
		case 'create-many':
		case 'upsert-many':
		case 'create-one':
		case 'update-one':
		case 'update-many':
		case 'upsert-one':
		case 'delete-one':
		case 'delete-many':
			return true
	}
}

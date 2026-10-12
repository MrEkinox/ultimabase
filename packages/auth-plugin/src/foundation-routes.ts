import type {
	CreateManyOperationAst,
	CreateOneOperationAst,
	DatabaseMutationOperationAst,
	SchemaDefinition,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from '@ultimabase/core'

import type { AuthHttpRoute } from './http-transport.js'
import { authOperations } from './operations.js'

/** Reads the create data of every create and upsert of a mutation. */
export const readCreateInputs = (
	operation: DatabaseMutationOperationAst,
): readonly Readonly<Record<string, unknown>>[] => {
	switch (operation.kind) {
		case 'create-one':
			return [
				(operation as unknown as CreateOneOperationAst<SchemaDefinition>).input,
			]
		case 'create-many':
			return (operation as unknown as CreateManyOperationAst<SchemaDefinition>)
				.inputs
		case 'upsert-one':
			return [
				(operation as unknown as UpsertOneOperationAst<SchemaDefinition>)
					.create,
			]
		case 'upsert-many':
			return (
				operation as unknown as UpsertManyOperationAst<SchemaDefinition>
			).items.map(({ create }) => create)
		default:
			return []
	}
}

/** The foundation's routes below the HTTP prefix. */
export const foundationRoutes: readonly AuthHttpRoute[] = [
	{
		body: 'none',
		operation: authOperations.current,
		path: 'current',
		response: 'result',
	},
	{
		body: 'none',
		operation: authOperations.refresh,
		path: 'refresh',
		response: 'session',
	},
	{
		body: 'none',
		operation: authOperations.logout,
		path: 'logout',
		response: 'clear',
	},
	{
		body: 'none',
		operation: authOperations.logoutEverywhere,
		path: 'logout-everywhere',
		response: 'clear',
	},
	{
		body: 'none',
		operation: authOperations.listSessions,
		path: 'list-sessions',
		response: 'result',
	},
	{
		body: 'json',
		operation: authOperations.revokeSession,
		path: 'revoke-session',
		response: 'result',
	},
	{
		body: 'none',
		operation: authOperations.listMethods,
		path: 'list-methods',
		response: 'result',
	},
	{
		body: 'json',
		operation: authOperations.unlinkMethod,
		path: 'unlink-method',
		response: 'result',
	},
	{
		body: 'none',
		operation: authOperations.deleteAccount,
		path: 'delete-account',
		response: 'clear',
	},
]

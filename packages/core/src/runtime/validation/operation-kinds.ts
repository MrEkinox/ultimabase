import type { OperationKind } from '../../query/index.js'

/** Enumerates closed operation branches shared by Runtime structural validators. */
export const mutationKinds: ReadonlySet<OperationKind> = new Set([
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
])

export const updateKinds: ReadonlySet<string> = new Set([
	'decrement',
	'increment',
	'set',
])

export const relationMutationActions: ReadonlySet<string> = new Set([
	'clear',
	'connect',
	'disconnect',
	'set',
])

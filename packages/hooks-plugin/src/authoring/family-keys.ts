import { immutableArray } from '@ultimabase/shared'

/** Keeps public family names and internal dispatch descriptors on one vocabulary. */
export const saveHookFamilies: readonly ['create', 'update', 'upsert'] =
	immutableArray(['create', 'update', 'upsert'])

/** Adds materialized delete operations to the save families. */
export const mutationHookFamilies: readonly [
	...typeof saveHookFamilies,
	'delete',
] = immutableArray([...saveHookFamilies, 'delete'])

/** Adds reads to the complete operation-family vocabulary. */
export const operationHookFamilies: readonly [
	...typeof mutationHookFamilies,
	'read',
] = immutableArray([...mutationHookFamilies, 'read'])

/** Identifies one logical family without splitting singular and bulk terminals. */
export type HookOperationFamily = (typeof operationHookFamilies)[number]

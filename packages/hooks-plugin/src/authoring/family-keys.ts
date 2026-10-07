import { immutableArray } from '@ultimabase/shared'

/** Keeps public family names and internal dispatch descriptors on one vocabulary. */
export const saveHookFamilies: readonly ['create', 'update', 'upsert'] =
	immutableArray(['create', 'update', 'upsert'])

/** Identifies one logical family without splitting singular and bulk terminals. */
export type HookOperationFamily =
	(typeof saveHookFamilies)[number] | 'delete' | 'read'

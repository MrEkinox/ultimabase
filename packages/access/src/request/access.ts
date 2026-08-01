import { immutableArray, immutableRecord } from '@ultimabase/shared'

const declaredAccessModes = ['anonymous', 'user', 'master'] as const

/** Enumerates the only authority levels understood by UltimaBase. */
export type AccessMode = (typeof declaredAccessModes)[number]

/** Exposes the closed access-mode set for exhaustive integrations. */
export const accessModes: readonly AccessMode[] =
	immutableArray(declaredAccessModes)

/** Represents an unauthenticated request without inventing a public user. */
export interface AnonymousRequestAccess {
	readonly mode: 'anonymous'
}

/** Retains only the stable authenticated user identity needed by access plugins. */
export interface UserRequestAccess<TUserId extends string = string> {
	readonly mode: 'user'
	readonly userId: TUserId
}

/** Records why trusted server code elevated one request to master authority. */
export interface MasterRequestAccess {
	readonly keyId: string
	readonly mode: 'master'
	readonly reason: string
}

/** Correlates authentication data with the three supported access modes. */
export type RequestAccess<TUserId extends string = string> =
	AnonymousRequestAccess | UserRequestAccess<TUserId> | MasterRequestAccess

/** Names security boundaries whose default master behavior must stay explicit. */
export type AccessBoundary =
	| 'acl'
	| 'business-hooks'
	| 'clp'
	| 'field-permissions'
	| 'sql-constraints'
	| 'structural-validation'
	| 'tenant-isolation'
	| 'transactions'

/** Documents the narrow permission-only bypass granted to master requests. */
export const defaultMasterBypassPolicy: Readonly<
	Record<AccessBoundary, boolean>
> = immutableRecord({
	acl: true,
	'business-hooks': false,
	clp: true,
	'field-permissions': true,
	'sql-constraints': false,
	'structural-validation': false,
	'tenant-isolation': false,
	transactions: false,
})

/** Lets permission plugins share one policy without bypassing Runtime stages. */
export const shouldBypassAccessBoundary = (
	access: RequestAccess,
	boundary: AccessBoundary,
): boolean => access.mode === 'master' && defaultMasterBypassPolicy[boundary]

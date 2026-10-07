import { immutableArray } from '@ultimabase/shared'

const declaredAccessModes = ['anonymous', 'master'] as const

/** Enumerates the only authority levels understood by UltimaBase. */
export type AccessMode = (typeof declaredAccessModes)[number]

/** Exposes the closed access-mode set for exhaustive integrations. */
export const accessModes: readonly AccessMode[] =
	immutableArray(declaredAccessModes)

/** Represents an unauthenticated request without inventing a public user. */
export interface AnonymousRequestAccess {
	readonly mode: 'anonymous'
}

/** Records why trusted server code elevated one request to master authority. */
export interface MasterRequestAccess {
	readonly keyId: string
	readonly mode: 'master'
	readonly reason: string
}

/** Correlates ordinary and trusted authority without defining authentication. */
export type RequestAccess = AnonymousRequestAccess | MasterRequestAccess

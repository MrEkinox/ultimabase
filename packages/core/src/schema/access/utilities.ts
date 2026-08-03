import { immutableRecord } from '@ultimabase/shared'

import type { OperationKind } from '../../query/index.js'
import type {
	SchemaCreateHookKind,
	SchemaDeleteHookKind,
	SchemaFindHookKind,
	SchemaMutationHookKind,
	SchemaUpdateHookKind,
	SchemaUpsertHookKind,
} from '../hooks/contracts.js'
import type {
	AccessDecisionRule,
	SchemaOperationAccessInput,
} from './contracts.js'

/**
 * Explicitly permits every request covered by one Access declaration.
 * @example `operation: { read: allowAll }`
 */
export const allowAll = true as const

/**
 * Explicitly rejects every request covered by one Access declaration.
 * @example `operation: { delete: denyAll }`
 */
export const denyAll = false as const

/** Represents one concise direct rule shared by compatible operation families. */
export type OperationAccessRule<TKind extends OperationKind> =
	AccessDecisionRule<SchemaOperationAccessInput<TKind>>

/** Contains one direct decision for every native operation family. */
export interface AllOperationAccess {
	readonly read: OperationAccessRule<SchemaFindHookKind>
	readonly create: OperationAccessRule<SchemaCreateHookKind>
	readonly update: OperationAccessRule<SchemaUpdateHookKind>
	readonly upsert: OperationAccessRule<SchemaUpsertHookKind>
	readonly delete: OperationAccessRule<SchemaDeleteHookKind>
}

/** Contains one direct decision for every native mutation family. */
export type AllMutationAccess = Readonly<Omit<AllOperationAccess, 'read'>>

/**
 * Applies one direct rule to every native operation family.
 *
 * Later object-spread properties override an individual family normally.
 * The returned record is a fresh immutable declaration and installs no
 * Runtime callback beyond the rule supplied by the developer.
 *
 * @example `{ ...allOperations(denyAll), read: allowAll }`
 */
export const allOperations = (
	rule: OperationAccessRule<OperationKind>,
): AllOperationAccess =>
	immutableRecord({
		create: rule,
		delete: rule,
		read: rule,
		update: rule,
		upsert: rule,
	})

/**
 * Applies one direct rule to create, update, upsert, and delete families.
 *
 * The returned record deliberately has no `read` property. It is a fresh
 * immutable declaration whose entries retain the supplied callback identity.
 *
 * @example `{ read: allowAll, ...allMutations(denyAll) }`
 */
export const allMutations = (
	rule: OperationAccessRule<SchemaMutationHookKind>,
): AllMutationAccess =>
	immutableRecord({
		create: rule,
		delete: rule,
		update: rule,
		upsert: rule,
	})

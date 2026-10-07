import { FrameworkError } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { ACL } from './acl.js'

/** Configures the maximum canonical subject entries retained by one ACL. */
export interface ACLEntryLimits {
	/**
	 * Limits exact principal entries after duplicate grants have been merged.
	 *
	 * @default 100
	 * @example `maxPrincipals: 100`
	 */
	readonly maxPrincipals?: number
	/**
	 * Limits role entries after duplicate grants have been merged.
	 *
	 * @default 50
	 * @example `maxRoles: 50`
	 */
	readonly maxRoles?: number
}

/** Configures application-wide defaults for persisted ACL size. */
export interface ACLPluginOptions {
	/** Sets finite subject-entry limits inherited by every ACL-enabled schema. */
	readonly limits?: ACLEntryLimits
}

/** Carries the effective finite limits used at mutation boundaries. */
export interface ResolvedACLEntryLimits {
	readonly maxPrincipals: number
	readonly maxRoles: number
}

/** Applies safe finite bounds when an application keeps zero-option setup. */
export const defaultACLEntryLimits: ResolvedACLEntryLimits = immutableRecord({
	maxPrincipals: 100,
	maxRoles: 50,
})

/** Snapshots one untrusted limit object without applying inherited defaults. */
export const normalizeACLEntryLimits = (
	limits: unknown,
	path: string,
): Readonly<ACLEntryLimits> | undefined => {
	if (limits === undefined) return undefined
	if (!isPlainRecord(limits)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	const unknownKey = Object.keys(limits).find(
		(key) => key !== 'maxPrincipals' && key !== 'maxRoles',
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} option: ${unknownKey}`)
	}

	const normalized: { maxPrincipals?: number; maxRoles?: number } = {}
	for (const key of ['maxPrincipals', 'maxRoles'] as const) {
		const value = limits[key]
		if (value === undefined) continue
		if (
			typeof value !== 'number' ||
			!Number.isSafeInteger(value) ||
			value < 0
		) {
			throw new RangeError(`${path}.${key} must be a non-negative safe integer`)
		}
		normalized[key] = value
	}
	return immutableRecord(normalized)
}

/** Resolves schema overrides independently while inheriting omitted values. */
export const resolveACLEntryLimits = (
	base: ResolvedACLEntryLimits,
	overrides: Readonly<ACLEntryLimits> | undefined,
): ResolvedACLEntryLimits =>
	immutableRecord({
		maxPrincipals: overrides?.maxPrincipals ?? base.maxPrincipals,
		maxRoles: overrides?.maxRoles ?? base.maxRoles,
	})

/** Rejects oversized canonical ACL documents before adapter persistence. */
export const assertACLEntryLimits = (
	value: ACL,
	limits: ResolvedACLEntryLimits,
): void => {
	const document = value.toJSON()
	const checks = [
		['principal', document.principals.length, limits.maxPrincipals],
		['role', document.roles.length, limits.maxRoles],
	] as const

	for (const [subject, count, limit] of checks) {
		if (count <= limit) continue
		throw new FrameworkError(
			'VALIDATION_ERROR',
			`ACL ${subject} entry limit exceeded: received ${String(count)}, maximum ${String(limit)}.`,
			{
				publicMessage: 'The ACL contains too many subject entries.',
				internalDetails: { count, kind: 'acl-entry-limit', limit, subject },
			},
		)
	}
}

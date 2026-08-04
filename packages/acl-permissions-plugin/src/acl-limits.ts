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

const assertLimit = (value: unknown, path: string): number => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${path} must be a non-negative safe integer`)
	}

	return value
}

/** Snapshots one untrusted limit object without applying inherited defaults. */
export const normalizeACLEntryLimits = (
	limits: ACLEntryLimits | undefined,
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

	return immutableRecord({
		...(limits.maxPrincipals === undefined
			? {}
			: {
					maxPrincipals: assertLimit(
						limits.maxPrincipals,
						`${path}.maxPrincipals`,
					),
				}),
		...(limits.maxRoles === undefined
			? {}
			: { maxRoles: assertLimit(limits.maxRoles, `${path}.maxRoles`) }),
	})
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

const createLimitError = (
	subject: 'principal' | 'role',
	count: number,
	limit: number,
): FrameworkError =>
	new FrameworkError(
		'VALIDATION_ERROR',
		`ACL ${subject} entry limit exceeded: received ${String(count)}, maximum ${String(limit)}.`,
		{
			publicMessage: 'The ACL contains too many subject entries.',
			internalDetails: {
				count,
				kind: 'acl-entry-limit',
				limit,
				subject,
			},
		},
	)

/** Rejects oversized canonical ACL documents before adapter persistence. */
export const assertACLEntryLimits = (
	value: ACL,
	limits: ResolvedACLEntryLimits,
): void => {
	const document = value.toJSON()

	if (document.principals.length > limits.maxPrincipals) {
		throw createLimitError(
			'principal',
			document.principals.length,
			limits.maxPrincipals,
		)
	}

	if (document.roles.length > limits.maxRoles) {
		throw createLimitError('role', document.roles.length, limits.maxRoles)
	}
}

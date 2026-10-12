import {
	RequestSubjectReference,
	FrameworkError,
	type Principal,
	type RequestSubjectContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	type RequestRoleReference,
	type RequestRoleResolver,
} from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'

import { ACL } from './acl.js'
import type { ACLChange } from './acl-change.js'
import type { ACLPermission } from './acl-contracts.js'
import {
	assertACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import type {
	ACLClientSharing,
	NormalizedACLSchemaOption,
} from './acl-option.js'

export type PersistentRoleResolver = NonNullable<
	RequestRoleResolver['resolvePersistentRole']
>

/** Carries the request facts needed to validate one accepted ACL value. */
export interface ACLAcceptance {
	readonly context: RequestSubjectContext
	readonly limits: ResolvedACLEntryLimits
	readonly resolvePersistentRole: PersistentRoleResolver | undefined
	readonly roleResolutionAvailable: boolean
}

export const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

/** Detects declarations that cannot become valid without role capabilities. */
export const hasStaticRoleGrant = (
	config: NormalizedACLSchemaOption,
): boolean =>
	config.default instanceof ACL && config.default.toJSON().roles.length > 0

const deniedACLManagement = (message: string, kind: string): FrameworkError =>
	new FrameworkError('PERMISSION_DENIED', message, {
		publicMessage: 'The operation is not permitted.',
		internalDetails: { kind },
	})

/** Keeps ACL-document management behind trusted server authority. */
export const assertMasterACLManagement = (
	context: RequestSubjectContext,
): void => {
	if (context.access.mode === 'master') return

	throw deniedACLManagement(
		'Only trusted master execution may supply or replace an ACL value; clients share with { grant } or { revoke } when acl.clientSharing allows it.',
		'acl-management-requires-master',
	)
}

/** ACL values this plugin accepted, so the field policy lets them through. */
const acceptedACLValues = new WeakSet<ACL>()

/** Reports whether this plugin produced one ACL operation value. */
export const isAcceptedACLValue = (value: unknown): boolean =>
	value instanceof ACL && acceptedACLValues.has(value)

/** Reports whether the caller holds `permission` on `acl` itself. */
const holdsACLPermission = (
	acl: ACL,
	principal: Principal | undefined,
	roles: readonly RequestRoleReference[],
	permission: ACLPermission,
): boolean =>
	acl.hasPublicPermission(permission) ||
	(principal !== undefined &&
		(acl.hasAuthenticatedPermission(permission) ||
			acl.hasPrincipalPermission(principal, permission))) ||
	roles.some((role) => acl.hasRolePermission(role, permission))

/**
 * Applies one `grant` or `revoke` to the locked ACL: Master always may; a
 * client only when `clientSharing` allows this row, and never grants rights
 * it does not hold itself (ADR-0321).
 */
export const applyACLChange = async (
	change: ACLChange,
	currentAcl: ACL,
	clientSharing: ACLClientSharing | undefined,
	context: RequestSubjectContext,
	principal: Principal | undefined,
	roles: readonly RequestRoleReference[],
): Promise<ACL> => {
	if (context.access.mode !== 'master') {
		if (
			clientSharing === undefined ||
			!(await clientSharing({ currentAcl, principal }))
		) {
			throw deniedACLManagement(
				'acl.clientSharing does not allow this caller to share the row.',
				'acl-sharing-denied',
			)
		}
		const escalated = (change.kind === 'grant' ? change.permissions : [])?.find(
			(permission) =>
				!holdsACLPermission(currentAcl, principal, roles, permission),
		)
		if (escalated !== undefined) {
			throw deniedACLManagement(
				`A client cannot grant the ${escalated} right it does not hold itself.`,
				'acl-sharing-escalation',
			)
		}
	}
	return change.applyTo(currentAcl)
}

/** Projects only developer fields so create and update callbacks share one data shape. */
export const projectACLData = (
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(input).filter(([fieldName]) => {
				const field = schema.persistedFields[fieldName]

				return (
					field !== undefined &&
					schema.provenance.fields[fieldName]?.owner.kind === 'application' &&
					!('system' in field.options && field.options.system === true)
				)
			}),
		),
	)

/**
 * Applies every adapter-neutral invariant to one accepted ACL value: role
 * grants need membership resolution, logical roles become stable provider
 * identities, and the canonical result must respect the entry limits.
 */
export const acceptACL = async (
	candidate: unknown,
	path: string,
	{
		context,
		limits,
		resolvePersistentRole,
		roleResolutionAvailable,
	}: ACLAcceptance,
): Promise<ACL> => {
	const value = snapshotResolvedACL(candidate, path)
	const document = value.toJSON()
	let accepted = value

	if (document.roles.length > 0) {
		if (!roleResolutionAvailable) {
			throw new TypeError(
				'ACL role grants require a role resolver with current-role enumeration',
			)
		}
		if (resolvePersistentRole === undefined) {
			throw new TypeError(
				'ACL role grants require a role resolver with persistent-role resolution',
			)
		}
		const roles = await Promise.all(
			document.roles.map(async ({ permissions, value: role }) => {
				const resolved = await resolvePersistentRole({
					context,
					role: new RequestSubjectReference('role', role),
				})
				if (!(resolved instanceof RequestSubjectReference)) {
					throw new TypeError(`ACL role could not be resolved: ${role}`)
				}
				return { kind: 'role' as const, permissions, value: resolved.value }
			}),
		)
		// Canonical parsing already unions aliases that resolve to the same role.
		accepted = ACL.fromJSON({ ...document, roles })
	}

	assertACLEntryLimits(accepted, limits)
	// A fresh copy: a caller's own instance never becomes trusted.
	const trusted = ACL.fromJSON(accepted.toJSON())
	acceptedACLValues.add(trusted)
	return trusted
}

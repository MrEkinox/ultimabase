import { type Model, type RequestRoleResolver } from '@ultimabase/core'
import type { RoleReference } from '@ultimabase/roles-plugin'

import type { RoleMember } from './roles-postgres.fixture.js'
import {
	AppRole,
	ExternalRoleReference,
	currentRoleMemberId,
} from './roles-postgres.fixture.js'
import { RequestContext, requestSources } from '@ultimabase/core/plugin'

export type PersistedAppRole = Model<typeof AppRole>
export type PersistedMember = Model<typeof RoleMember>

export const requireRoleResolver = (value: unknown): RequestRoleResolver => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('hasRole' in value) ||
		typeof value.hasRole !== 'function'
	) {
		throw new TypeError('Role resolver consumer did not expose hasRole')
	}

	return value as RequestRoleResolver
}

export const requireMember = (
	member: PersistedMember | undefined,
	label: string,
): PersistedMember => {
	if (member === undefined) {
		throw new TypeError(`Missing persisted ${label} member fixture`)
	}

	return member
}

// ADR-0310: role results have no commands; links change through `updateOne`.
export const masterOptions = { useMasterKey: true } as const

export const updateAppRole = (
	roleId: string,
	data: Parameters<typeof AppRole.updateOne>[0]['data'],
) => AppRole.updateOne({ where: { id: { eq: roleId } }, data }, masterOptions)

// ADR-0310: links are read through include, not relation handles.
export const countRoleLinks = async (
	roleId: string,
	field: 'includedRoles' | 'members',
): Promise<number> => {
	const role = await AppRole.findOneOrThrow(
		{
			where: { id: { eq: roleId } },
			select: { id: true },
			include: {
				members: { select: { id: true } },
				includedRoles: { select: { id: true } },
			},
		},
		masterOptions,
	)
	return role[field].length
}

export const requireRole = (
	role: PersistedAppRole | undefined,
	label: string,
): PersistedAppRole => {
	if (role === undefined) {
		throw new TypeError(`Missing persisted ${label} role fixture`)
	}

	return role
}

/** Creates plugin-owned identity state without introducing a Core user mode. */
export const createMemberContext = (memberId: string, requestId: string) =>
	RequestContext.anonymous({
		requestId,
		source: requestSources.internal,
	}).withValue(currentRoleMemberId, memberId)

/** Persists one neutral external role reference through the ordinary Query API. */
export const createExternalReference = async (
	reference: RoleReference,
): Promise<void> => {
	await ExternalRoleReference.createOne({ data: { subject: reference.value } })
}

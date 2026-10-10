import {
	type NamedRequestSubjectReferenceCleanup,
	type OperationOptions,
	type RequestSubjectContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { RoleDeletedEvent } from './role-events.js'
import { createRoleReference, type RoleReference } from './role-reference.js'
import { resolveRoleReference, roleQuerySchema } from './role-resolution.js'
import type { RoleSchemaDeclaration } from './role-schema.js'

/** Reports deterministic deletion-policy failures owned by the roles package. */
export class RoleDeletionError extends Error {
	constructor(
		readonly code:
			| 'ROLE_DELETE_BULK_UNSUPPORTED'
			| 'ROLE_DELETE_CASCADE_MASTER_REQUIRED'
			| 'ROLE_DELETE_REFERENCED',
		message: string,
	) {
		super(message)
		this.name = 'RoleDeletionError'
		Object.freeze(this)
	}
}

const masterOptions: OperationOptions = Object.freeze({
	useMasterKey: true,
})

/** Reads whether one role still has direct members or child roles. */
const readRoleEdges = async (
	schema: SchemaDefinition,
	roleId: string,
): Promise<Readonly<{ children: number; members: number }>> => {
	const role = await roleQuerySchema(schema).findOne(
		{
			where: { id: roleId },
			select: { id: true },
			include: {
				members: { select: { id: true }, take: 1 },
				roles: { select: { id: true }, take: 1 },
			},
		},
		masterOptions,
	)
	const count = (field: string): number => {
		const value: unknown = role === null ? [] : Reflect.get(role, field)
		return isUnknownArray(value) ? value.length : 0
	}
	return { children: count('roles'), members: count('members') }
}

const readRoleId = (role: object): string => {
	const roleId: unknown = Reflect.get(role, 'id')

	if (typeof roleId !== 'string') {
		throw new TypeError('Persisted role must expose its stable id')
	}

	return roleId
}

/** Reads parents through the public relation predicate API inside the transaction. */
const readParentRoles = (
	schema: SchemaDefinition,
	roleId: string,
): Promise<readonly object[]> =>
	// The public quantified relation predicate compiles to one indexed join lookup.
	roleQuerySchema(schema).findMany(
		{ where: { roles: { some: { id: { eq: roleId } } } } },
		masterOptions,
	)

/** Rejects deletion while any role-owned edge or external reference remains. */
const assertUnreferenced = async (
	context: RequestSubjectContext,
	role: object,
	schema: SchemaDefinition,
	reference: RoleReference,
	cleanups: readonly NamedRequestSubjectReferenceCleanup[],
): Promise<void> => {
	const roleId = readRoleId(role)
	const edges = await readRoleEdges(schema, roleId)
	const parentRoles = await readParentRoles(schema, roleId)
	// Every owner is asked, even when an earlier check already found a reference.
	let externallyReferenced = false

	for (const { cleanup } of cleanups) {
		if (await cleanup.hasReferences({ context, reference })) {
			externallyReferenced = true
		}
	}

	if (
		edges.members > 0 ||
		edges.children > 0 ||
		parentRoles.length > 0 ||
		externallyReferenced
	) {
		throw new RoleDeletionError(
			'ROLE_DELETE_REFERENCED',
			`Role ${roleId} still has membership, hierarchy, or external references`,
		)
	}
}

/** Clears role-owned edges, then lets every cleanup owner remove its references. */
const cascadeReferences = async (
	context: RequestSubjectContext,
	role: object,
	schema: SchemaDefinition,
	reference: RoleReference,
	cleanups: readonly NamedRequestSubjectReferenceCleanup[],
): Promise<readonly string[]> => {
	if (context.access.mode !== 'master') {
		throw new RoleDeletionError(
			'ROLE_DELETE_CASCADE_MASTER_REQUIRED',
			'Cascade role deletion requires master authority',
		)
	}

	const roleId = readRoleId(role)
	const roles = roleQuerySchema(schema)
	const parentRoles = await readParentRoles(schema, roleId)

	// Links go through the schema commands of ADR-0308 (no relation handles).
	await roles.updateOne(
		{
			where: { id: roleId },
			data: { members: { set: [] }, roles: { set: [] } },
			select: { id: true },
		},
		masterOptions,
	)

	for (const parentRole of parentRoles) {
		await roles.updateOne(
			{
				where: { id: readRoleId(parentRole) },
				data: { roles: { disconnect: [roleId] } },
				select: { id: true },
			},
			masterOptions,
		)
	}

	const invoked: string[] = []

	for (const { cleanup, name } of cleanups) {
		await cleanup.cleanup({ context, reference })
		invoked.push(name)
	}

	return immutableArray(invoked)
}

/** Applies one schema-owned policy before the adapter removes the role row. */
export const applyRoleDeletionPolicy = async (
	context: RequestSubjectContext,
	schema: SchemaDefinition,
	roleName: string,
	declaration: RoleSchemaDeclaration,
	cleanups: readonly NamedRequestSubjectReferenceCleanup[],
): Promise<RoleDeletedEvent> => {
	const role = await resolveRoleReference(
		createRoleReference(schema, { name: roleName }),
		masterOptions,
	)
	const roleId = readRoleId(role)
	const reference = createRoleReference(schema, { id: roleId })
	const policy = declaration.deletionPolicy
	let cleanupContributions: readonly string[] = immutableArray([])

	if (policy === 'fail') {
		await assertUnreferenced(context, role, schema, reference, cleanups)
	} else if (policy === 'cascade') {
		cleanupContributions = await cascadeReferences(
			context,
			role,
			schema,
			reference,
			cleanups,
		)
	}

	return immutableRecord({ cleanupContributions, policy, roleId })
}

import {
	Pointer,
	type NamedRequestSubjectReferenceCleanup,
	type OperationOptions,
	type RequestSubjectContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { RoleDeletedEvent } from './role-events.js'
import { readRoleRelation } from './role-hierarchy.js'
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

/** Describes the persisted role being deleted and its stable UUID reference. */
interface RoleDeletionTarget {
	readonly context: RequestSubjectContext
	readonly role: object
	readonly roleId: string
	readonly schema: SchemaDefinition
	readonly reference: RoleReference
	readonly cleanups: readonly NamedRequestSubjectReferenceCleanup[]
}

const readRelation = (role: object, fieldName: 'members' | 'roles') =>
	readRoleRelation(
		role,
		fieldName,
		'Persisted role must expose generated relations',
		`Persisted role returned an invalid ${fieldName} relation`,
	)

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
const assertUnreferenced = async ({
	cleanups,
	context,
	reference,
	role,
	roleId,
	schema,
}: RoleDeletionTarget): Promise<void> => {
	const memberCount = await readRelation(role, 'members').count(
		{},
		masterOptions,
	)
	const childRoleCount = await readRelation(role, 'roles').count(
		{},
		masterOptions,
	)
	const parentRoles = await readParentRoles(schema, roleId)
	// Every owner is asked, even when an earlier check already found a reference.
	let externallyReferenced = false

	for (const { cleanup } of cleanups) {
		if (await cleanup.hasReferences({ context, reference })) {
			externallyReferenced = true
		}
	}

	if (
		memberCount > 0 ||
		childRoleCount > 0 ||
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
const cascadeReferences = async ({
	cleanups,
	context,
	reference,
	role,
	roleId,
	schema,
}: RoleDeletionTarget): Promise<readonly string[]> => {
	if (context.access.mode !== 'master') {
		throw new RoleDeletionError(
			'ROLE_DELETE_CASCADE_MASTER_REQUIRED',
			'Cascade role deletion requires master authority',
		)
	}

	const rolePointer = new Pointer(schema, roleId)
	const parentRoles = await readParentRoles(schema, rolePointer.id)

	await readRelation(role, 'members').clear(masterOptions)
	await readRelation(role, 'roles').clear(masterOptions)

	for (const parentRole of parentRoles) {
		await readRelation(parentRole, 'roles').disconnect(
			rolePointer.id,
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
	const roleId: unknown = Reflect.get(role, 'id')

	if (typeof roleId !== 'string') {
		throw new TypeError('Persisted role must expose its stable id')
	}

	const target: RoleDeletionTarget = {
		cleanups,
		context,
		reference: createRoleReference(schema, { id: roleId }),
		role,
		roleId,
		schema,
	}
	const policy = declaration.deletionPolicy
	let cleanupContributions: readonly string[] = immutableArray([])

	if (policy === 'fail') {
		await assertUnreferenced(target)
	} else if (policy === 'cascade') {
		cleanupContributions = await cascadeReferences(target)
	}

	return immutableRecord({ cleanupContributions, policy, roleId })
}

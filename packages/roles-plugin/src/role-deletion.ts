import {
	defineEvent,
	Query,
	Relation,
	Pointer,
	type AccessContext,
	type AccessReferenceCleanup,
	type HookContext,
	type HookEventContract,
	type JsonObject,
	type QueryTerminalOptions,
	type RelationField,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createRoleReference } from './role-reference.js'
import { resolveRoleReference } from './role-resolution.js'
import type {
	RoleReferenceDeletionPolicy,
	RoleSchemaDeclaration,
} from './role-schema.js'

/** Names the post-commit audit event emitted for every deleted stored role. */
export const roleDeletedEvent = 'ultimabase.roles.deleted' as const

/** Describes one committed role deletion without exposing consumer internals. */
export interface RoleDeletedEvent extends JsonObject {
	readonly cleanupContributions: readonly string[]
	readonly policy: RoleReferenceDeletionPolicy
	readonly roleId: string
}

const roleDeletedEventContract: HookEventContract<
	typeof roleDeletedEvent,
	RoleDeletedEvent,
	'optional'
> = defineEvent<RoleDeletedEvent>()(roleDeletedEvent, { delivery: 'optional' })

/** Reports deterministic deletion-policy failures owned by the roles package. */
export class RoleDeletionError extends Error {
	readonly code:
		| 'ROLE_DELETE_BULK_UNSUPPORTED'
		| 'ROLE_DELETE_CASCADE_MASTER_REQUIRED'
		| 'ROLE_DELETE_REFERENCED'

	constructor(
		code:
			| 'ROLE_DELETE_BULK_UNSUPPORTED'
			| 'ROLE_DELETE_CASCADE_MASTER_REQUIRED'
			| 'ROLE_DELETE_REFERENCED',
		message: string,
	) {
		super(message)
		this.name = 'RoleDeletionError'
		this.code = code
		Object.freeze(this)
	}
}

/** Retains registry provenance beside a validated generic cleanup contract. */
export interface NamedRoleReferenceCleanup {
	readonly cleanup: AccessReferenceCleanup
	readonly name: string
}

type RoleDeletionLookupSchema = SchemaDefinition<
	string,
	Readonly<{
		readonly roles: RelationField<RoleDeletionLookupSchema>
	}>
>

const masterOptions: QueryTerminalOptions = Object.freeze({
	useMasterKey: true,
})

const readRelation = (
	role: object,
	fieldName: 'members' | 'roles',
): Relation => {
	const relationMethod: unknown = Reflect.get(role, 'relation')

	if (typeof relationMethod !== 'function') {
		throw new TypeError('Persisted role must expose generated relations')
	}

	const invokeRelation = relationMethod as (
		this: object,
		fieldName: 'members' | 'roles',
	) => unknown
	const relation = invokeRelation.call(role, fieldName)

	if (!Relation.is(relation)) {
		throw new TypeError(
			`Persisted role returned an invalid ${fieldName} relation`,
		)
	}

	return relation
}

const readRoleId = (role: object): string => {
	const roleId: unknown = Reflect.get(role, 'id')

	if (typeof roleId !== 'string') {
		throw new TypeError('Persisted role must expose its stable id')
	}

	return roleId
}

/** Reads parents through the public relation predicate API inside the transaction. */
const readParentRoles = async (
	schema: SchemaDefinition,
	roleId: string,
): Promise<readonly object[]> => {
	const lookupSchema = schema as unknown as RoleDeletionLookupSchema

	// The public quantified relation predicate compiles to one indexed join lookup.
	return new Query(lookupSchema)
		.where((where) => where.some('roles', (role) => role.eq('id', roleId)))
		.find(masterOptions)
}

const readExternalReferences = async (
	context: AccessContext,
	reference: ReturnType<typeof createRoleReference>,
	cleanups: readonly NamedRoleReferenceCleanup[],
): Promise<readonly string[]> => {
	const owners: string[] = []

	for (const contribution of cleanups) {
		if (await contribution.cleanup.hasReferences({ context, reference })) {
			owners.push(contribution.name)
		}
	}

	return immutableArray(owners)
}

const assertUnreferenced = async (
	context: AccessContext,
	role: object,
	schema: SchemaDefinition,
	reference: ReturnType<typeof createRoleReference>,
	cleanups: readonly NamedRoleReferenceCleanup[],
): Promise<void> => {
	const memberCount = await readRelation(role, 'members')
		.query()
		.count(masterOptions)
	const childRoleCount = await readRelation(role, 'roles')
		.query()
		.count(masterOptions)
	const parentRoles = await readParentRoles(schema, readRoleId(role))
	const externalOwners = await readExternalReferences(
		context,
		reference,
		cleanups,
	)

	if (
		memberCount > 0 ||
		childRoleCount > 0 ||
		parentRoles.length > 0 ||
		externalOwners.length > 0
	) {
		throw new RoleDeletionError(
			'ROLE_DELETE_REFERENCED',
			`Role ${readRoleId(role)} still has membership, hierarchy, or external references`,
		)
	}
}

const cascadeReferences = async (
	context: AccessContext,
	role: object,
	schema: SchemaDefinition,
	reference: ReturnType<typeof createRoleReference>,
	cleanups: readonly NamedRoleReferenceCleanup[],
): Promise<readonly string[]> => {
	if (context.access.mode !== 'master') {
		throw new RoleDeletionError(
			'ROLE_DELETE_CASCADE_MASTER_REQUIRED',
			'Cascade role deletion requires master authority',
		)
	}

	const rolePointer = new Pointer(schema, readRoleId(role))
	const parentRoles = await readParentRoles(schema, rolePointer.id)

	await readRelation(role, 'members').clear(masterOptions)
	await readRelation(role, 'roles').clear(masterOptions)

	for (const parentRole of parentRoles) {
		await readRelation(parentRole, 'roles').disconnect(
			rolePointer,
			masterOptions,
		)
	}

	const invoked: string[] = []

	for (const contribution of cleanups) {
		await contribution.cleanup.cleanup({ context, reference })
		invoked.push(contribution.name)
	}

	return immutableArray(invoked)
}

/** Applies one schema-owned policy before the adapter removes the role row. */
export const applyRoleDeletionPolicy = async (
	context: HookContext,
	schema: SchemaDefinition,
	roleName: string,
	declaration: RoleSchemaDeclaration,
	cleanups: readonly NamedRoleReferenceCleanup[],
): Promise<void> => {
	const role = await resolveRoleReference(
		createRoleReference(schema, { name: roleName }),
		masterOptions,
	)
	const roleId = readRoleId(role)
	const stableReference = createRoleReference(schema, { id: roleId })
	let cleanupContributions: readonly string[] = immutableArray([])

	if (declaration.deletionPolicy === 'fail') {
		await assertUnreferenced(context, role, schema, stableReference, cleanups)
	} else if (declaration.deletionPolicy === 'cascade') {
		cleanupContributions = await cascadeReferences(
			context,
			role,
			schema,
			stableReference,
			cleanups,
		)
	}

	const payload: RoleDeletedEvent = immutableRecord({
		cleanupContributions,
		policy: declaration.deletionPolicy,
		roleId,
	})

	// HookContext journals the event and publishes it only after outer commit.
	context.emit(roleDeletedEventContract, payload)
}

/** Rejects set-based deletion because it cannot preserve per-role policy hooks. */
export const assertSingularRoleDeletion = (operation: unknown): void => {
	if (
		typeof operation === 'object' &&
		operation !== null &&
		Reflect.get(operation, 'kind') === 'delete-many'
	) {
		throw new RoleDeletionError(
			'ROLE_DELETE_BULK_UNSUPPORTED',
			'Role deletion must target one materialized role at a time',
		)
	}
}

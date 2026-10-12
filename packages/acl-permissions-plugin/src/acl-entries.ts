import {
	RequestSubjectReference,
	Schema,
	type Pointer,
	type SchemaClass,
	type SchemaDefinition,
} from '@ultimabase/core'
import { type RequestRoleReference } from '@ultimabase/plugin-kit'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ACLPermission } from './acl-contracts.js'
import type { ACLJSON } from './acl-json.js'

/** One subject of an ACL with its rights, as `acl.entries()` lists them. */
export type ACLEntry =
	| Readonly<{
			/** Everyone, signed in or not. */
			kind: 'public'
			permissions: readonly ACLPermission[]
	  }>
	| Readonly<{
			/** Every request with a principal. */
			kind: 'authenticated'
			permissions: readonly ACLPermission[]
	  }>
	| Readonly<{
			/** One user, or any row a principal points to. */
			kind: 'principal'
			principal: Pointer
			permissions: readonly ACLPermission[]
	  }>
	| Readonly<{
			/**
			 * One role. Its name is read with Roles' `resolveRoleReference(role)`;
			 * `grantRole(role, ...)` accepts it back.
			 */
			kind: 'role'
			role: RequestRoleReference
			permissions: readonly ACLPermission[]
	  }>

/** Identifies one principal entry by its schema and identifier. */
export const principalKey = (principal: {
	readonly id: string
	toJSON(): { readonly className: string }
}): string => JSON.stringify([principal.toJSON().className, principal.id])

// Decoded ACLs only hold class names; Pointers need their schema (ADR-0314).
// One application is initialized per realm, so its schemas are the ones read.
const principalSchemas = new Map<string, SchemaClass>()

/** Records the schemas whose Pointers `entries()` may return. */
export const registerACLPrincipalSchemas = (
	schemas: Iterable<SchemaDefinition>,
): void => {
	for (const schema of schemas) {
		if (Schema.is(schema)) principalSchemas.set(schema.className, schema)
	}
}

const readPrincipal = (
	className: string,
	id: string,
	known: ReadonlyMap<string, Pointer>,
): Pointer => {
	const pointer = known.get(JSON.stringify([className, id]))
	if (pointer !== undefined) return pointer
	const schema = principalSchemas.get(className)
	if (schema === undefined) {
		throw new TypeError(
			`ACL entries() needs the schema ${className}: initialize the application first`,
		)
	}
	return schema.pointer(id)
}

/** Lists the subjects of one canonical document (ADR-0321). */
export const createACLEntries = (
	document: ACLJSON,
	known: ReadonlyMap<string, Pointer>,
): readonly ACLEntry[] =>
	immutableArray([
		...(document.public.length === 0
			? []
			: [
					immutableRecord({
						kind: 'public' as const,
						permissions: document.public,
					}),
				]),
		...(document.authenticated.length === 0
			? []
			: [
					immutableRecord({
						kind: 'authenticated' as const,
						permissions: document.authenticated,
					}),
				]),
		...document.principals.map(({ className, id, permissions }) =>
			immutableRecord({
				kind: 'principal' as const,
				principal: readPrincipal(className, id, known),
				permissions,
			}),
		),
		...document.roles.map(({ permissions, value }) =>
			immutableRecord({
				kind: 'role' as const,
				role: new RequestSubjectReference('role', value),
				permissions,
			}),
		),
	])

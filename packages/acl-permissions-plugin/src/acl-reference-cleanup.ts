import { AsyncLocalStorage } from 'node:async_hooks'

import {
	AccessSubjectReference,
	databaseConstraint,
	defineAccessReferenceCleanup,
	parseAccessPrincipalReference,
	Query,
	Schema,
	type AccessPrincipalReference,
	type AccessReferenceCleanup,
	type AccessRoleReference,
	type DatabaseConstraintNode,
	type DatabaseConstraintPayloadObject,
	type SchemaDefinition,
	type WhereInput,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import { aclFieldName } from './acl-extension.js'

/** Names the adapter-neutral predicate used only while maintaining references. */
export const aclReferenceConstraintKind = 'ultimabase.acl.reference' as const

/** Selects the first stable ACL reference-search payload contract. */
export const aclReferenceConstraintVersion = 1 as const

/** Carries one exact principal or role identity to an ACL-aware adapter. */
export interface ACLReferenceConstraintPayload extends DatabaseConstraintPayloadObject {
	readonly field: typeof aclFieldName
	readonly subjectKind: 'principal' | 'role'
	readonly principalClassName: string | null
	readonly principalId: string | null
	readonly role: string | null
}

/** Represents the exact opaque node understood by ACL-aware adapters. */
export type ACLReferenceConstraint = DatabaseConstraintNode<
	typeof aclReferenceConstraintKind,
	typeof aclReferenceConstraintVersion,
	ACLReferenceConstraintPayload
>

/** Keeps parsed subject identities private from generic cleanup providers. */
export type ACLReferenceSubject =
	| Readonly<{
			className: string
			id: string
			kind: 'principal'
	  }>
	| Readonly<{
			kind: 'role'
			value: string
	  }>

interface ACLReferenceScope {
	readonly schema: SchemaDefinition
	readonly subject: ACLReferenceSubject
}

const referenceScope = new AsyncLocalStorage<ACLReferenceScope>()
const cleanupPlaceholder = new ACL()

const readPrincipalSubject = (
	reference: AccessPrincipalReference,
): ACLReferenceSubject => {
	const identity = parseAccessPrincipalReference(reference)

	return immutableRecord({
		className: identity.className,
		id: identity.id,
		kind: 'principal' as const,
	})
}

const readRoleSubject = (
	reference: AccessRoleReference,
): ACLReferenceSubject => {
	const candidate: unknown = reference

	if (
		!(candidate instanceof AccessSubjectReference) ||
		candidate.kind !== 'role'
	) {
		throw new TypeError('ACL role cleanup reference is invalid')
	}

	assertNonEmptyString(candidate.value, 'ACL role cleanup reference value')

	return immutableRecord({ kind: 'role' as const, value: candidate.value })
}

/** Runs one internal Query branch with an untransformable reference predicate. */
const runWithReferenceScope = <TResult>(
	schema: SchemaDefinition,
	subject: ACLReferenceSubject,
	callback: () => TResult,
): TResult => referenceScope.run(immutableRecord({ schema, subject }), callback)

/** Reads maintenance state only for the exact application-owned schema instance. */
export const getACLReferenceScope = (
	schema: SchemaDefinition,
): ACLReferenceSubject | undefined => {
	const active = referenceScope.getStore()

	return active?.schema === schema ? active.subject : undefined
}

/** Converts one parsed maintenance subject into a portable adapter constraint. */
export const createACLReferenceConstraint = (
	subject: ACLReferenceSubject,
): ACLReferenceConstraint =>
	databaseConstraint(
		aclReferenceConstraintKind,
		aclReferenceConstraintVersion,
		subject.kind === 'principal'
			? {
					field: aclFieldName,
					principalClassName: subject.className,
					principalId: subject.id,
					role: null,
					subjectKind: subject.kind,
				}
			: {
					field: aclFieldName,
					principalClassName: null,
					principalId: null,
					role: subject.value,
					subjectKind: subject.kind,
				},
	)

/** Removes only one exact subject entry from an immutable ACL document. */
export const removeACLReference = (
	value: ACL,
	subject: ACLReferenceSubject,
): ACL => {
	const document = value.toJSON()

	return ACL.fromJSON(
		subject.kind === 'principal'
			? {
					...document,
					principals: document.principals.filter(
						(entry) =>
							entry.className !== subject.className || entry.id !== subject.id,
					),
				}
			: {
					...document,
					roles: document.roles.filter(
						(entry) => entry.value !== subject.value,
					),
				},
	)
}

const hasSchemaReferences = (
	schema: SchemaDefinition,
	subject: ACLReferenceSubject,
): Promise<boolean> =>
	runWithReferenceScope(schema, subject, () =>
		new Query(schema).exists({ useMasterKey: true }),
	)

const findSchemaReferenceIds = async (
	schema: SchemaDefinition,
	subject: ACLReferenceSubject,
): Promise<readonly string[]> => {
	const rows = await runWithReferenceScope(schema, subject, () =>
		new Query(schema).select({ id: true }).findMany({ useMasterKey: true }),
	)

	return immutableArray(
		rows.map((row, index) => {
			const id: unknown = Reflect.get(row, 'id')

			if (typeof id !== 'string') {
				throw new TypeError(
					`ACL reference query returned an invalid id at index ${String(index)}`,
				)
			}

			return id
		}),
	)
}

const removeSchemaReferences = async (
	schema: SchemaDefinition,
	subject: ACLReferenceSubject,
): Promise<void> => {
	if (!Schema.is(schema)) {
		throw new TypeError(
			'ACL reference cleanup requires a registered schema class',
		)
	}

	const ids = await findSchemaReferenceIds(schema, subject)

	for (const id of ids) {
		// Every Schema carries the framework UUID even when this cleanup intentionally
		// erases the concrete field map while iterating registered definitions.
		const where = {
			id: { eq: id },
		} as unknown as WhereInput<typeof schema>

		await runWithReferenceScope(schema, subject, () =>
			schema.updateOne(
				{
					where,
					data: { [aclFieldName]: cleanupPlaceholder },
				},
				{ useMasterKey: true },
			),
		)
	}
}

const hasAnyReferences = async (
	schemas: readonly SchemaDefinition[],
	subject: ACLReferenceSubject,
): Promise<boolean> => {
	for (const schema of schemas) {
		if (await hasSchemaReferences(schema, subject)) return true
	}

	return false
}

const removeAllReferences = async (
	schemas: readonly SchemaDefinition[],
	subject: ACLReferenceSubject,
): Promise<void> => {
	for (const schema of schemas) {
		await removeSchemaReferences(schema, subject)
	}
}

/** Creates both application-local contributions consumed by subject owners. */
export const createACLReferenceCleanups = (
	schemas: readonly SchemaDefinition[],
): Readonly<{
	principal: Readonly<
		AccessReferenceCleanup<'principal', AccessPrincipalReference>
	>
	role: Readonly<AccessReferenceCleanup<'role', AccessRoleReference>>
}> => {
	const ownedSchemas = immutableArray(schemas)

	return immutableRecord({
		principal: defineAccessReferenceCleanup({
			kind: 'principal',
			hasReferences: ({ reference }) =>
				hasAnyReferences(ownedSchemas, readPrincipalSubject(reference)),
			cleanup: ({ reference }) =>
				removeAllReferences(ownedSchemas, readPrincipalSubject(reference)),
		}),
		role: defineAccessReferenceCleanup({
			kind: 'role',
			hasReferences: ({ reference }) =>
				hasAnyReferences(ownedSchemas, readRoleSubject(reference)),
			cleanup: ({ reference }) =>
				removeAllReferences(ownedSchemas, readRoleSubject(reference)),
		}),
	})
}

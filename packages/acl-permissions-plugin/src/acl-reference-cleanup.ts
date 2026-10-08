import { AsyncLocalStorage } from 'node:async_hooks'

import {
	RequestSubjectReference,
	defineRequestSubjectReferenceCleanup,
	parseRequestPrincipalReference,
	Schema,
	type RequestPrincipalReference,
	type RequestSubjectReferenceCleanup,
	type RequestRoleReference,
	type DatabaseRowFilterNode,
	type SchemaDefinition,
	type WhereInput,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import type { ACLContainmentOperand } from './acl-containment.js'
import { aclFieldName } from './acl-option.js'

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

const referenceScope = new AsyncLocalStorage<
	Readonly<{ schema: SchemaDefinition; subject: ACLReferenceSubject }>
>()
const cleanupPlaceholder = new ACL()

const readPrincipalSubject = (
	reference: RequestPrincipalReference,
): ACLReferenceSubject => {
	const identity = parseRequestPrincipalReference(reference)

	return immutableRecord({
		className: identity.className,
		id: identity.id,
		kind: 'principal' as const,
	})
}

const readRoleSubject = (
	reference: RequestRoleReference,
): ACLReferenceSubject => {
	const candidate: unknown = reference

	if (
		!(candidate instanceof RequestSubjectReference) ||
		candidate.kind !== 'role'
	) {
		throw new TypeError('ACL role cleanup reference is invalid')
	}

	assertNonEmptyString(candidate.value, 'ACL role cleanup reference value')

	return immutableRecord({ kind: 'role' as const, value: candidate.value })
}

/** Reads maintenance state only for the exact application-owned schema instance. */
export const getACLReferenceScope = (
	schema: SchemaDefinition,
): ACLReferenceSubject | undefined => {
	const active = referenceScope.getStore()

	return active?.schema === schema ? active.subject : undefined
}

/** Converts one parsed maintenance subject into a portable protected row filter. */
export const createACLReferenceRowFilter = (
	subject: ACLReferenceSubject,
): DatabaseRowFilterNode => {
	const value: ACLContainmentOperand =
		subject.kind === 'principal'
			? { principals: [{ className: subject.className, id: subject.id }] }
			: { roles: [{ kind: 'role', value: subject.value }] }

	return immutableRecord({ field: aclFieldName, kind: 'contains', value })
}

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

const asSchemaClass = (definition: SchemaDefinition) => {
	if (!Schema.is(definition)) {
		throw new TypeError(
			'ACL reference cleanup requires a registered schema class',
		)
	}
	return definition
}

/**
 * Runs one internal master query with an untransformable reference predicate:
 * the `acl-reference-rows` constraint restricts it to rows naming `subject`.
 */
const inReferenceScope = <TResult>(
	schema: SchemaDefinition,
	subject: ACLReferenceSubject,
	callback: () => TResult,
): TResult => referenceScope.run(immutableRecord({ schema, subject }), callback)

const hasAnyReferences = async (
	schemas: readonly SchemaDefinition[],
	subject: ACLReferenceSubject,
): Promise<boolean> => {
	for (const definition of schemas) {
		const schema = asSchemaClass(definition)
		const found = await inReferenceScope(schema, subject, () =>
			schema.exists({}, { useMasterKey: true }),
		)
		if (found) return true
	}
	return false
}

/** Rewrites every referencing row through ordinary singular master updates. */
const removeAllReferences = async (
	schemas: readonly SchemaDefinition[],
	subject: ACLReferenceSubject,
): Promise<void> => {
	for (const definition of schemas) {
		const schema = asSchemaClass(definition)
		const rows = await inReferenceScope(schema, subject, () =>
			schema.findMany({ select: { id: true } }, { useMasterKey: true }),
		)
		const ids = rows.map((row, index) => {
			const id: unknown = Reflect.get(row, 'id')
			if (typeof id !== 'string') {
				throw new TypeError(
					`ACL reference query returned an invalid id at index ${String(index)}`,
				)
			}
			return id
		})

		for (const id of ids) {
			// Every Schema carries the framework UUID even when this cleanup intentionally
			// erases the concrete field map while iterating registered definitions.
			const where = { id: { eq: id } } as unknown as WhereInput<typeof schema>
			await inReferenceScope(schema, subject, () =>
				schema.updateOne(
					{ where, data: { [aclFieldName]: cleanupPlaceholder } },
					{ useMasterKey: true },
				),
			)
		}
	}
}

/** Creates both application-local contributions consumed by subject owners. */
export const createACLReferenceCleanups = (
	schemas: readonly SchemaDefinition[],
): Readonly<{
	principal: Readonly<
		RequestSubjectReferenceCleanup<'principal', RequestPrincipalReference>
	>
	role: Readonly<RequestSubjectReferenceCleanup<'role', RequestRoleReference>>
}> => {
	const ownedSchemas = immutableArray(schemas)

	return immutableRecord({
		principal: defineRequestSubjectReferenceCleanup({
			kind: 'principal',
			hasReferences: ({ reference }) =>
				hasAnyReferences(ownedSchemas, readPrincipalSubject(reference)),
			cleanup: ({ reference }) =>
				removeAllReferences(ownedSchemas, readPrincipalSubject(reference)),
		}),
		role: defineRequestSubjectReferenceCleanup({
			kind: 'role',
			hasReferences: ({ reference }) =>
				hasAnyReferences(ownedSchemas, readRoleSubject(reference)),
			cleanup: ({ reference }) =>
				removeAllReferences(ownedSchemas, readRoleSubject(reference)),
		}),
	})
}

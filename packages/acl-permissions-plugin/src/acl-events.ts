import {
	defineFieldKindHookTarget,
	onEvent,
	type FieldMutationHookKind,
	type FieldKindHookTarget,
	type HookEventDefinition,
	type HookEventHandler,
	type JsonObject,
	type PointerValue,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { ACL } from './acl.js'
import { aclPermissions, type ACLPermission } from './acl-contracts.js'
import { aclFieldKind, type ACLField } from './acl-extension.js'

/** Names the committed event emitted for every persisted ACL change. */
export const aclChangedEvent = 'ultimabase.acl.changed' as const

/** Selects every materialized save terminal that may persist an ACL value. */
export type ACLChangedOperation = Extract<
	FieldMutationHookKind,
	'create-many' | 'create-one' | 'update-one' | 'upsert-many' | 'upsert-one'
>

/** Identifies one optional plugin-owned principal without exposing its schema. */
export interface ACLChangePrincipal extends JsonObject {
	readonly className: string
	readonly id: string
}

/** Identifies the request authority that caused one persisted ACL transition. */
export interface ACLChangeActor extends JsonObject {
	readonly authority: 'anonymous' | 'master'
	readonly principal: ACLChangePrincipal | null
}

/** Identifies one public ACL subject in a permission delta. */
export interface ACLPublicChangeSubject extends JsonObject {
	readonly kind: 'public'
}

/** Identifies the authenticated ACL subject in a permission delta. */
export interface ACLAuthenticatedChangeSubject extends JsonObject {
	readonly kind: 'authenticated'
}

/** Identifies one exact schema-qualified principal in a permission delta. */
export interface ACLPrincipalChangeSubject extends JsonObject {
	readonly className: string
	readonly id: string
	readonly kind: 'principal'
}

/** Identifies one stable provider-owned role in a permission delta. */
export interface ACLRoleChangeSubject extends JsonObject {
	readonly kind: 'role'
	readonly value: string
}

/** Describes every subject shape that can gain or lose ACL permissions. */
export type ACLChangeSubject =
	| ACLAuthenticatedChangeSubject
	| ACLPrincipalChangeSubject
	| ACLPublicChangeSubject
	| ACLRoleChangeSubject

/** Groups the rights added to or removed from one exact ACL subject. */
export interface ACLPermissionChange extends JsonObject {
	readonly permissions: readonly ACLPermission[]
	readonly subject: ACLChangeSubject
}

/** Contains the canonical semantic difference between two ACL values. */
export interface ACLChangeDiff extends JsonObject {
	readonly added: readonly ACLPermissionChange[]
	readonly removed: readonly ACLPermissionChange[]
}

/** Identifies the exact object whose persisted ACL changed. */
export interface ACLChangeTarget extends JsonObject {
	readonly className: string
	readonly id: string
}

/** Carries one audit-ready ACL transition after its transaction commits. */
export interface ACLChangedEvent extends JsonObject {
	readonly actor: ACLChangeActor
	readonly diff: ACLChangeDiff
	readonly operation: ACLChangedOperation
	readonly target: ACLChangeTarget
}

/** Handles one committed ACL transition through Core's named-event registry. */
export type ACLChangedEventHandler = HookEventHandler<
	typeof aclChangedEvent,
	ACLChangedEvent
>

interface ACLSubjectEntry {
	readonly key: string
	readonly permissions: readonly ACLPermission[]
	readonly subject: ACLChangeSubject
}

/** Lets the ACL plugin attach native field hooks without exposing a second API. */
export const aclFieldHookTarget: FieldKindHookTarget<ACLField> =
	defineFieldKindHookTarget<ACLField>(aclFieldKind)

const subjectKey = (kind: string, ...parts: readonly string[]): string =>
	JSON.stringify([kind, ...parts])

/** Flattens canonical ACL JSON while preserving its deterministic subject order. */
const collectSubjectEntries = (value: ACL): readonly ACLSubjectEntry[] => {
	const document = value.toJSON()
	const entries: ACLSubjectEntry[] = [
		immutableRecord({
			key: subjectKey('public'),
			permissions: document.public,
			subject: immutableRecord({ kind: 'public' as const }),
		}),
		immutableRecord({
			key: subjectKey('authenticated'),
			permissions: document.authenticated,
			subject: immutableRecord({ kind: 'authenticated' as const }),
		}),
	]

	for (const principal of document.principals) {
		entries.push(
			immutableRecord({
				key: subjectKey('principal', principal.className, principal.id),
				permissions: principal.permissions,
				subject: immutableRecord({
					className: principal.className,
					id: principal.id,
					kind: 'principal' as const,
				}),
			}),
		)
	}

	for (const role of document.roles) {
		entries.push(
			immutableRecord({
				key: subjectKey('role', role.value),
				permissions: role.permissions,
				subject: immutableRecord({
					kind: 'role' as const,
					value: role.value,
				}),
			}),
		)
	}

	return immutableArray(entries)
}

/** Computes canonical permission additions from one ordered subject snapshot. */
const collectPermissionChanges = (
	source: readonly ACLSubjectEntry[],
	comparison: ReadonlyMap<string, ACLSubjectEntry>,
): readonly ACLPermissionChange[] => {
	const changes: ACLPermissionChange[] = []

	for (const entry of source) {
		const existing = comparison.get(entry.key)
		const permissions = aclPermissions.filter(
			(permission) =>
				entry.permissions.includes(permission) &&
				!existing?.permissions.includes(permission),
		)

		if (permissions.length === 0) continue

		changes.push(
			immutableRecord({
				permissions: immutableArray(permissions),
				subject: entry.subject,
			}),
		)
	}

	return immutableArray(changes)
}

/** Computes one detached semantic ACL diff without exposing internal maps. */
export const createACLChangeDiff = (
	previous: ACL,
	current: ACL,
): ACLChangeDiff => {
	const previousEntries = collectSubjectEntries(previous)
	const currentEntries = collectSubjectEntries(current)
	const previousByKey = new Map(
		previousEntries.map((entry) => [entry.key, entry] as const),
	)
	const currentByKey = new Map(
		currentEntries.map((entry) => [entry.key, entry] as const),
	)

	return immutableRecord({
		added: collectPermissionChanges(currentEntries, previousByKey),
		removed: collectPermissionChanges(previousEntries, currentByKey),
	})
}

/** Creates one portable event payload from an authorized persisted transition. */
export const createACLChangedEvent = (options: {
	readonly authority: ACLChangeActor['authority']
	readonly className: string
	readonly current: ACL
	readonly itemId: string
	readonly operation: ACLChangedOperation
	readonly previous: ACL
	readonly principal: PointerValue | undefined
}): ACLChangedEvent => {
	const principal = options.principal?.toJSON()

	return immutableRecord({
		actor: immutableRecord({
			authority: options.authority,
			principal:
				principal === undefined
					? null
					: immutableRecord({
							className: principal.className,
							id: principal.id,
						}),
		}),
		diff: createACLChangeDiff(options.previous, options.current),
		operation: options.operation,
		target: immutableRecord({
			className: options.className,
			id: options.itemId,
		}),
	})
}

/**
 * Creates one precisely typed consumer for committed ACL change events.
 *
 * @example `onACLChange(({ event }) => audit.write(event.payload))`
 */
export const onACLChange = (
	handler: ACLChangedEventHandler,
): HookEventDefinition<typeof aclChangedEvent, ACLChangedEvent> =>
	onEvent({ handler, name: aclChangedEvent })

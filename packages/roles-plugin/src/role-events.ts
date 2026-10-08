import type {
	CapabilityProviderDeclaration,
	CapabilityRequirement,
	JsonObject,
	RelationMutationAction,
} from '@ultimabase/core'
import {
	definePluginEvent,
	definePluginEventCapability,
	observePluginEvent,
	optionalPluginEvents,
	providePluginEvent,
	type PluginEventCapability,
	type PluginEventContract,
	type PluginEventHandler,
	type PluginEventObserver,
} from '@ultimabase/plugin-kit'

import type { RoleReferenceDeletionPolicy } from './role-schema.js'

/** Names the post-commit event emitted for every direct member-edge change. */
export const roleMembershipChangedEvent =
	'ultimabase.roles.membership.changed' as const

/** Describes one committed change to a generated member relation. */
export interface RoleMembershipChangedEvent extends JsonObject {
	readonly action: RelationMutationAction
	readonly memberIds: readonly string[]
	readonly roleId: string
}

export const roleMembershipChangedEventContract: PluginEventContract<
	typeof roleMembershipChangedEvent,
	RoleMembershipChangedEvent,
	'optional'
> = definePluginEvent<RoleMembershipChangedEvent>()(
	roleMembershipChangedEvent,
	{ delivery: 'optional' },
)

/** Names the post-commit event emitted for every nested-role edge change. */
export const roleHierarchyChangedEvent =
	'ultimabase.roles.hierarchy.changed' as const

/** Describes one committed change to a generated child-role relation. */
export interface RoleHierarchyChangedEvent extends JsonObject {
	readonly action: RelationMutationAction
	readonly childRoleIds: readonly string[]
	readonly roleId: string
}

export const roleHierarchyChangedEventContract: PluginEventContract<
	typeof roleHierarchyChangedEvent,
	RoleHierarchyChangedEvent,
	'optional'
> = definePluginEvent<RoleHierarchyChangedEvent>()(roleHierarchyChangedEvent, {
	delivery: 'optional',
})

/** Names the post-commit audit event emitted for every deleted stored role. */
export const roleDeletedEvent = 'ultimabase.roles.deleted' as const

/** Describes one committed role deletion without exposing consumer internals. */
export interface RoleDeletedEvent extends JsonObject {
	readonly cleanupContributions: readonly string[]
	readonly policy: RoleReferenceDeletionPolicy
	readonly roleId: string
}

export const roleDeletedEventContract: PluginEventContract<
	typeof roleDeletedEvent,
	RoleDeletedEvent,
	'optional'
> = definePluginEvent<RoleDeletedEvent>()(roleDeletedEvent, {
	delivery: 'optional',
})

/** Carries independently owned stored-role observers into the Roles Runtime provider. */
const roleEventsCapability: PluginEventCapability<
	'ultimabase.role-events',
	'1.0.0'
> = definePluginEventCapability({
	capabilityId: 'ultimabase.role-events',
	version: '1.0.0',
})

/** @internal Declares observer discovery without imposing plugin lifecycle order. */
export const optionalRoleEvents: CapabilityRequirement<
	typeof roleEventsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalPluginEvents(roleEventsCapability, '^1.0.0')

export function onRoleEvent(
	event: typeof roleMembershipChangedEvent,
	handler: PluginEventHandler<
		typeof roleMembershipChangedEvent,
		RoleMembershipChangedEvent
	>,
): PluginEventObserver<
	typeof roleMembershipChangedEvent,
	RoleMembershipChangedEvent
>
export function onRoleEvent(
	event: typeof roleHierarchyChangedEvent,
	handler: PluginEventHandler<
		typeof roleHierarchyChangedEvent,
		RoleHierarchyChangedEvent
	>,
): PluginEventObserver<
	typeof roleHierarchyChangedEvent,
	RoleHierarchyChangedEvent
>
export function onRoleEvent(
	event: typeof roleDeletedEvent,
	handler: PluginEventHandler<typeof roleDeletedEvent, RoleDeletedEvent>,
): PluginEventObserver<typeof roleDeletedEvent, RoleDeletedEvent>
/** Creates one precisely typed observer for a committed stored-role event. */
export function onRoleEvent(
	event:
		| typeof roleDeletedEvent
		| typeof roleHierarchyChangedEvent
		| typeof roleMembershipChangedEvent,
	handler: unknown,
): PluginEventObserver {
	if (typeof handler !== 'function') {
		throw new TypeError('role event handler must be a function')
	}
	const contract: PluginEventContract =
		event === roleDeletedEvent
			? roleDeletedEventContract
			: event === roleHierarchyChangedEvent
				? roleHierarchyChangedEventContract
				: roleMembershipChangedEventContract
	return observePluginEvent(contract, handler as PluginEventHandler)
}

/** Provides one role observer with Core-owned provenance and observe privilege. */
export const provideRoleEventObserver = (
	contributionId: string,
	observer: PluginEventObserver,
): CapabilityProviderDeclaration<typeof roleEventsCapability> =>
	providePluginEvent(roleEventsCapability, contributionId, observer)

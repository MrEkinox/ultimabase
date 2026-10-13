//#region role-audit
import { plugin } from '@ultimabase/core/plugin'
import {
	onRoleEvent,
	provideRoleEventObserver,
	roleDeletedEvent,
	roleHierarchyChangedEvent,
	roleMembershipChangedEvent,
} from '@ultimabase/roles-plugin'

/** Committed role changes, in order. Replace it with a durable audit sink. */
export const roleAuditLog: string[] = []

/**
 * Observes the Roles events: each one arrives once, after its transaction
 * commits, and never for a change that rolled back.
 */
export const roleAuditPlugin = plugin({
	id: 'example.role-audit',
	version: '1.0.0',
	core: '^0.0.0',
	// A peer, not a dependency: Roles delivers to the observers it finds.
	peers: [{ pluginId: '@ultimabase/roles-plugin', version: '^0.0.0' }],
	permissions: { 'runtime:observe': 'Records committed role changes.' },
	contributions: [
		provideRoleEventObserver(
			'role-audit-membership',
			onRoleEvent(roleMembershipChangedEvent, ({ event }) => {
				const { action, memberIds, roleId } = event.payload
				roleAuditLog.push(`${roleId}: ${action} members ${memberIds.join()}`)
			}),
		),
		provideRoleEventObserver(
			'role-audit-hierarchy',
			onRoleEvent(roleHierarchyChangedEvent, ({ event }) => {
				const { action, childRoleIds, roleId } = event.payload
				roleAuditLog.push(
					`${roleId}: ${action} included roles ${childRoleIds.join()}`,
				)
			}),
		),
		provideRoleEventObserver(
			'role-audit-deleted',
			onRoleEvent(roleDeletedEvent, ({ event }) => {
				const { policy, roleId } = event.payload
				roleAuditLog.push(`${roleId}: deleted (${policy})`)
			}),
		),
	],
})
//#endregion role-audit

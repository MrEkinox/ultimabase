//#region acl-audit-plugin
import {
	onACLChange,
	provideACLChangeObserver,
	type ACLChangedEvent,
} from '@ultimabase/acl-permissions-plugin'
import { plugin } from '@ultimabase/core/plugin'

/** Every committed ACL change, in order: a stand-in for a durable audit log. */
export const aclAuditLog: ACLChangedEvent[] = []

/** Records who changed which rights on which row, after each commit. */
export const aclAuditPlugin = plugin({
	id: 'example.acl-audit',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [
		{ pluginId: '@ultimabase/acl-permissions-plugin', version: '^0.0.0' },
	],
	permissions: {
		'runtime:observe': 'Records committed ACL changes.',
	},
	contributions: [
		provideACLChangeObserver(
			'record-acl-change',
			onACLChange(({ event }) => {
				aclAuditLog.push(event.payload)
			}),
		),
	],
})
//#endregion acl-audit-plugin

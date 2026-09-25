import type { PluginInstance } from '@ultimabase/core'

import type { ACLEntryLimits } from './acl-limits.js'
import type { aclPluginId } from './acl-option.js'

/** Configures application-wide defaults for persisted ACL size. */
export interface ACLPluginOptions {
	/** Sets finite subject-entry limits inherited by every ACL-enabled schema. */
	readonly limits?: ACLEntryLimits
}

/** Represents the exact optional ACL provider configured for one application. */
export type ACLPlugin = PluginInstance<{
	readonly id: typeof aclPluginId
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
}>

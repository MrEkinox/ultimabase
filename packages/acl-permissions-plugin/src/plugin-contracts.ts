import type { ACLEntryLimits } from './acl-limits.js'

/** Configures application-wide defaults for persisted ACL size. */
export interface ACLPluginOptions {
	/** Sets finite subject-entry limits inherited by every ACL-enabled schema. */
	readonly limits?: ACLEntryLimits
}

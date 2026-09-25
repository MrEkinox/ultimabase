import type {
	CapabilityProviderDeclaration,
	CapabilityRequirement,
	requestPrincipalResolverCapability,
	requestRoleResolverCapability,
	requestSubjectReferenceCleanupCapability,
	runtimeBehaviorCapability,
	runtimeConstraintCapability,
	runtimeInterceptorCapability,
} from '@ultimabase/core'
import type { PluginModule, PluginModuleInstance } from '@ultimabase/plugin-kit'

import type { aclChangedEventsCapability } from './acl-events.js'
import type { ACLEntryLimits } from './acl-limits.js'
import type { aclPluginId } from './acl-option.js'

/** Configures application-wide defaults for persisted ACL size. */
export interface ACLPluginOptions {
	/** Sets finite subject-entry limits inherited by every ACL-enabled schema. */
	readonly limits?: ACLEntryLimits
}

/** Keeps requested ACL authority explicit in both the factory and public type. */
export type ACLPluginPrivileges = readonly [
	Readonly<{
		readonly name: 'schema:declare'
		readonly reason: 'Declares the direct ACL option and its persisted field patch.'
	}>,
	Readonly<{
		readonly name: 'authority:elevate'
		readonly reason: 'Maintains persisted ACL references through audited internal Master queries.'
	}>,
	Readonly<{
		readonly name: 'runtime:constrain'
		readonly reason: 'Applies deny-only ACL guards and adapter constraints.'
	}>,
	Readonly<{
		readonly name: 'runtime:intercept'
		readonly reason: 'Resolves ACL input and publishes committed ACL changes.'
	}>,
	Readonly<{
		readonly name: 'event:publish'
		readonly reason: 'Publishes committed ACL change notifications.'
	}>,
]

/** @internal Shares the reviewed manifest requests with the runtime factory. */
export const aclPluginPrivileges: ACLPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the direct ACL option and its persisted field patch.',
	},
	{
		name: 'authority:elevate',
		reason:
			'Maintains persisted ACL references through audited internal Master queries.',
	},
	{
		name: 'runtime:constrain',
		reason: 'Applies deny-only ACL guards and adapter constraints.',
	},
	{
		name: 'runtime:intercept',
		reason: 'Resolves ACL input and publishes committed ACL changes.',
	},
	{
		name: 'event:publish',
		reason: 'Publishes committed ACL change notifications.',
	},
]

type ACLPluginDefinition = Readonly<{
	readonly capabilities: Readonly<{
		readonly optional: readonly [
			CapabilityRequirement<
				typeof requestPrincipalResolverCapability,
				true,
				'^1.0.0',
				'materialization'
			>,
			CapabilityRequirement<
				typeof requestRoleResolverCapability,
				true,
				'^1.0.0',
				'materialization'
			>,
			CapabilityRequirement<
				typeof aclChangedEventsCapability,
				true,
				'^1.0.0',
				'materialization'
			>,
		]
		readonly provides: readonly [
			CapabilityProviderDeclaration<
				typeof requestSubjectReferenceCleanupCapability
			>,
			CapabilityProviderDeclaration<
				typeof requestSubjectReferenceCleanupCapability
			>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeInterceptorCapability>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeBehaviorCapability>,
		]
	}>
	readonly privileges: ACLPluginPrivileges
}>

/** Represents the exact optional ACL provider configured for one application. */
export type ACLPlugin = PluginModuleInstance<
	PluginModule<typeof aclPluginId, '0.0.0', '^0.0.0'>,
	ACLPluginDefinition
>

import type {
	accessPrincipalResolverCapability,
	accessReferenceCleanupCapability,
	accessRoleResolverCapability,
	runtimeConstraintCapability,
	runtimeBehaviorCapability,
	runtimeInterceptorCapability,
	CapabilityProviderDeclaration,
	CapabilityRequirement,
	FrameworkPlugin,
	SchemaDefinition,
} from '@ultimabase/core'

import type { aclChangedEventsCapability } from './acl-events.js'
import type { ACLEntryLimits } from './acl-limits.js'
import type { aclPluginName } from './acl-extension.js'

/** Exposes ACL-enabled schemas discovered in one application. */
export interface ACLPluginExports {
	readonly schemas: readonly SchemaDefinition[]
}

/** Configures application-wide defaults for persisted ACL size. */
export interface ACLPluginOptions {
	/** Sets finite subject-entry limits inherited by every ACL-enabled schema. */
	readonly limits?: ACLEntryLimits
}

/** Represents the optional ACL provider configured for one application. */
export type ACLPlugin = FrameworkPlugin<
	typeof aclPluginName,
	ACLPluginExports,
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	'0.0.0',
	'^0.0.0',
	readonly [
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
	],
	undefined,
	Readonly<{
		readonly optional: readonly [
			CapabilityRequirement<
				typeof accessPrincipalResolverCapability,
				true,
				'^1.0.0'
			>,
			CapabilityRequirement<
				typeof accessRoleResolverCapability,
				true,
				'^1.0.0'
			>,
			CapabilityRequirement<
				typeof aclChangedEventsCapability,
				true,
				'^1.0.0',
				'materialization'
			>,
		]
		readonly provides: readonly [
			CapabilityProviderDeclaration<typeof accessReferenceCleanupCapability>,
			CapabilityProviderDeclaration<typeof accessReferenceCleanupCapability>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeInterceptorCapability>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
			CapabilityProviderDeclaration<typeof runtimeBehaviorCapability>,
		]
	}>
>

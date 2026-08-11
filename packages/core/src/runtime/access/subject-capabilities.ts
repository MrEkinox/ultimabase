import {
	accessRoleResolverCapability,
	type AccessRoleResolver,
} from '../../access/index.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationCapability } from '../../plugins/application-capability-access.js'
import { getCurrentApplication } from '../context/active-framework-context.js'

/** Resolves the exact role capability for the active application execution. */
export const requireCurrentAccessRoleResolver = (): AccessRoleResolver => {
	const resolver = readApplicationCapability(
		getCurrentApplication(),
		accessRoleResolverCapability,
	)
	if (resolver !== undefined) return resolver

	throw new FrameworkError(
		'PLUGIN_CAPABILITY_MISSING',
		'Active application requires an Access role resolver capability.',
		{
			internalDetails: {
				capabilityId: accessRoleResolverCapability.capabilityId,
				requiredVersion: '^1.0.0',
			},
		},
	)
}

import {
	requestRoleResolverCapability,
	type RequestRoleResolver,
} from '../../access/index.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationCapability } from '../../plugins/application-capability-access.js'
import { getCurrentApplication } from '../context/active-framework-context.js'

/** Resolves the exact role capability for the active application execution. */
export const requireCurrentRequestRoleResolver = (): RequestRoleResolver => {
	const resolver = readApplicationCapability(
		getCurrentApplication(),
		requestRoleResolverCapability,
	)
	if (resolver !== undefined) return resolver

	throw new FrameworkError(
		'PLUGIN_CAPABILITY_MISSING',
		'Active application requires a request role resolver capability.',
		{
			internalDetails: {
				capabilityId: requestRoleResolverCapability.capabilityId,
				requiredVersion: '^1.0.0',
			},
		},
	)
}

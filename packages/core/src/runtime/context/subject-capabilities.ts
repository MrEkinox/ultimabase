import {
	requestRoleResolverCapability,
	type RequestRoleResolver,
} from '../../access/index.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { immutableRecord } from '@ultimabase/shared'
import { getCurrentApplication } from './active-framework-context.js'

const attributedRoleResolvers = new WeakMap<object, RequestRoleResolver>()

/** Resolves the exact role capability for the active application execution. */
export const requireCurrentRequestRoleResolver = (): RequestRoleResolver => {
	const application = getCurrentApplication()
	const existing = attributedRoleResolvers.get(application)
	if (existing !== undefined) return existing

	const contribution = readApplicationKernelState(
		application,
	).capabilityContributions(requestRoleResolverCapability)[0]
	if (contribution !== undefined) {
		const resolver = contribution.value
		const resolvePersistentRole = resolver.resolvePersistentRole?.bind(resolver)
		const resolveCurrentRoles = resolver.resolveCurrentRoles?.bind(resolver)
		const attributed: RequestRoleResolver = immutableRecord({
			hasRole: (input) =>
				runWithApplicationPluginOwner(application, contribution.owner, () =>
					resolver.hasRole(input),
				),
			...(resolvePersistentRole === undefined
				? {}
				: {
						resolvePersistentRole: (input) =>
							runWithApplicationPluginOwner(
								application,
								contribution.owner,
								() => resolvePersistentRole(input),
							),
					}),
			...(resolveCurrentRoles === undefined
				? {}
				: {
						resolveCurrentRoles: (input) =>
							runWithApplicationPluginOwner(
								application,
								contribution.owner,
								() => resolveCurrentRoles(input),
							),
					}),
		})
		attributedRoleResolvers.set(application, attributed)
		return attributed
	}

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

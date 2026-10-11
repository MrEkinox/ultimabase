import {
	requestRoleResolverCapability,
	type RequestRoleResolver,
} from '../../access/index.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { immutableRecord } from '@ultimabase/shared'
import { getCurrentEngine } from './active-framework-context.js'
import { readRequestEngineApplication } from '../engine/request-engine.js'

const attributedRoleResolvers = new WeakMap<object, RequestRoleResolver>()

/** Resolves the exact role capability for the active application execution. */
export const requireCurrentRequestRoleResolver = (): RequestRoleResolver => {
	const application = readRequestEngineApplication(getCurrentEngine())
	const existing = attributedRoleResolvers.get(application)
	if (existing !== undefined) return existing

	const contribution = readApplicationKernelState(
		application,
	).capabilityContributions(requestRoleResolverCapability)[0]
	if (contribution === undefined) {
		throw new FrameworkError(
			'PLUGIN_CAPABILITY_MISSING',
			`Active application requires a request role resolver capability.${requestRoleResolverCapability.hint === undefined ? '' : ` ${requestRoleResolverCapability.hint}`}`,
			{
				internalDetails: {
					capabilityId: requestRoleResolverCapability.capabilityId,
					requiredVersion: '^1.0.0',
					...(requestRoleResolverCapability.hint === undefined
						? {}
						: { hint: requestRoleResolverCapability.hint }),
				},
			},
		)
	}

	// Every resolver call keeps the contributing plugin's privilege attribution.
	const resolver = contribution.value
	const attribute =
		<TInput, TResult>(method: (input: TInput) => TResult) =>
		(input: TInput): TResult =>
			runWithApplicationPluginOwner(application, contribution.owner, () =>
				method(input),
			)
	const resolvePersistentRole = resolver.resolvePersistentRole?.bind(resolver)
	const resolveCurrentRoles = resolver.resolveCurrentRoles?.bind(resolver)
	const attributed: RequestRoleResolver = immutableRecord({
		hasRole: attribute((input) => resolver.hasRole(input)),
		...(resolvePersistentRole === undefined
			? {}
			: { resolvePersistentRole: attribute(resolvePersistentRole) }),
		...(resolveCurrentRoles === undefined
			? {}
			: { resolveCurrentRoles: attribute(resolveCurrentRoles) }),
	})
	attributedRoleResolvers.set(application, attributed)
	return attributed
}

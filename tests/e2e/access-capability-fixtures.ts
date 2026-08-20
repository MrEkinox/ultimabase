import {
	requestPrincipalResolverCapability,
	requestRoleResolverCapability,
	provideCapability,
	type RequestPrincipalResolver,
	type RequestRoleResolver,
} from '@ultimabase/core'

/** Creates one application-local principal resolver for an E2E fixture plugin. */
export const provideTestPrincipalResolver = (
	resolver: RequestPrincipalResolver,
) =>
	provideCapability(requestPrincipalResolverCapability, {
		contributionId: 'principal-resolver',
		create: () => ({ value: resolver }),
	})

/** Creates one application-local role resolver for an E2E fixture plugin. */
export const provideTestRoleResolver = (resolver: RequestRoleResolver) =>
	provideCapability(requestRoleResolverCapability, {
		contributionId: 'role-resolver',
		create: () => ({ value: resolver }),
	})

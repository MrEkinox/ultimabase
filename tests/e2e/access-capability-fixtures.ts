import {
	accessPrincipalResolverCapability,
	accessRoleResolverCapability,
	provideCapability,
	type AccessPrincipalResolver,
	type AccessRoleResolver,
} from '@ultimabase/core'

/** Creates one application-local principal resolver for an E2E fixture plugin. */
export const provideTestPrincipalResolver = (
	resolver: AccessPrincipalResolver,
) =>
	provideCapability(accessPrincipalResolverCapability, {
		contributionId: 'principal-resolver',
		create: () => ({ value: resolver }),
	})

/** Creates one application-local role resolver for an E2E fixture plugin. */
export const provideTestRoleResolver = (resolver: AccessRoleResolver) =>
	provideCapability(accessRoleResolverCapability, {
		contributionId: 'role-resolver',
		create: () => ({ value: resolver }),
	})

export { authPlugin, authPluginId } from './plugin.js'
export type {
	AuthPlugin,
	AuthPluginFactory,
	AuthPluginOptions,
} from './plugin.js'
export type { AuthPluginExports, AuthUserTarget } from './application-api.js'
export type {
	AuthLinking,
	AuthMethodInfo,
	LinkedAccountInput,
} from './accounts.js'
export type { AttemptSubject } from './attempts.js'
export {
	authErrorCodes,
	authErrorStatuses,
	rejectCredentials,
	rejectSession,
	rejectSignUp,
} from './errors.js'
export type { AuthErrorCode } from './errors.js'
export type {
	AuthEmailChangedEvent,
	AuthEmailVerifiedEvent,
	AuthEventBase,
	AuthEventHandlers,
	AuthEvents,
	AuthLoginEvent,
	AuthLoginFailedEvent,
	AuthLogoutEvent,
	AuthPasswordResetEvent,
	AuthSignUpEvent,
} from './events.js'
export {
	authGraphqlBinding,
	authPayloadTypes,
	graphqlField,
	graphqlList,
	graphqlNamed,
	graphqlNonNull,
	graphqlObjectType,
	graphqlUser,
	toAuthPayload,
} from './graphql.js'
export type {
	AuthCookieOptions,
	AuthCookieSameSite,
	AuthHttpOptions,
} from './http-options.js'
export type { AuthHttpRoute } from './http-transport.js'
export { defineAuthMethod } from './method.js'
export type {
	AuthenticatedRequest,
	AuthMethod,
	AuthMethodImplementation,
	AuthMethodOperation,
	AuthMethodStatics,
	AuthMethodStaticsHKT,
	AuthMethodUserFields,
	AuthServices,
	AuthStaticsServices,
} from './method.js'
export { authOperations, authPublicOperations } from './operations.js'
export type {
	AuthDeleteAccountResult,
	AuthFoundationOperation,
	AuthIdInput,
	AuthLogoutResult,
	AuthMethodList,
	AuthSessionList,
	AuthUnlinkResult,
} from './operations.js'
export type { AuthPrincipal } from './principal.js'
export { authClient, authPrincipal, authSession } from './session.js'
export type {
	AuthClient,
	AuthenticationResult,
	AuthSession,
	IssuedAuthSession,
} from './session.js'
export { defaultAuthSessionPolicy } from './session-policy.js'
export type {
	AuthSessionOptions,
	ResolvedAuthSessionPolicy,
} from './session-policy.js'
export type { AuthSessionInfo } from './sessions.js'
export { snapshotSignUpInput } from './user-creation.js'
export { authenticationResult, nullInput, stringFieldsInput } from './values.js'
export type {
	UserSchemaFactories,
	UserSchemaFactory,
	UserSchemaFactoryMembers,
	UserSchemaFields,
	UserSchemaOptions,
	UserSchemaStaticsSlot,
} from './user-schema.js'
export type { AuthUserStatics } from './user-statics.js'

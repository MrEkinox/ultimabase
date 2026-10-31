// `@ultimabase/auth` (D-112, D-113): the user model, sessions, linked
// accounts, the caller of each request, and the rules that read it.
export { defineUser } from './define-user.ts'
export type {
	Auth,
	AuthApi,
	AuthCommands,
	AuthOptions,
	Opened,
} from './plugin.ts'
export { authPlugin } from './plugin.ts'
export {
	currentUser,
	isAuthenticated,
	isOwner,
	isSelf,
	signedIn,
	signedInRun,
} from './rules.ts'

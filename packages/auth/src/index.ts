// `@ultimabase/auth` (D-112): the user model, sessions, the caller of each
// request, and the rules that read it.
export { defineUser } from './define-user.ts'
export type { Auth, AuthApi, Opened, Reply } from './plugin.ts'
export { authPlugin } from './plugin.ts'
export {
	currentUser,
	isAuthenticated,
	isOwner,
	isSelf,
	signedIn,
} from './rules.ts'

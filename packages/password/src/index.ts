// `@ultimabase/password` (D-113): sign-up and sign-in with an email and a
// password, hashed with Argon2id, the attempts limited.
export type { SignedIn } from './core.ts'
export type { Credentials } from './input.ts'
export type {
	Password,
	PasswordCommands,
	PasswordOptions,
	UserField,
} from './plugin.ts'
export { password, passwordPlugin } from './plugin.ts'

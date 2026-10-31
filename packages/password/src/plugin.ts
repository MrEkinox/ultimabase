// `passwordPlugin()` and `password()` (D-113): a sign-in method, an ordinary
// plugin with its functions, its models, its commands and its options.
import type { Auth, AuthApi } from '@ultimabase/auth'
import { authPlugin } from '@ultimabase/auth'
import type {
	Client,
	ExposedModel,
	Field,
	Identity,
	Payload,
	PluginOf,
	PluginTypes,
	Queries,
	Register,
	UseOf,
	UserOf,
} from 'ultimabase'
import {
	definePlugin,
	isMaster,
	master,
	PublicError,
	Refused,
} from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { SignedIn, State } from './core.ts'
import {
	attemptOf,
	checkCurrent,
	createUser,
	setPassword,
	signedIn,
	verified,
} from './core.ts'
import {
	created,
	committed,
	creating,
	readsEmail,
	updated,
	updating,
} from './email-field.ts'
import type { SendEmail } from './email-functions.ts'
import { emailFunctions, mailerOf } from './email-functions.ts'
import { passwordFunctions } from './functions.ts'
import type { Credentials, Property } from './input.ts'
import { emailOf, fieldProperty, passwordOf, valid } from './input.ts'
import { PasswordAttempt, PasswordHash, PasswordRequest } from './models.ts'
import { PasswordToken } from './tokens.ts'

/** The user fields a sign-up may take; any name before the user is registered. */
export type UserField = Register extends { readonly user: unknown }
	? Extract<
			Exclude<keyof UserOf<Register>, 'id' | 'createdAt' | 'updatedAt'>,
			string
		>
	: string

export interface PasswordOptions {
	/** The user fields `signUp` takes besides the email and the password; `false` closes sign-up. */
	readonly signUp?: readonly UserField[] | false
	/**
	 * Sends an email that carries a token: a reset or a verification link
	 * the application writes. Without it, no function sends one (D-117).
	 */
	readonly sendEmail?: SendEmail
}

type Options = { readonly as?: Identity }
/** A transport's client, which counts the attempt and gets the cookie (D-115). */
type SignInOptions = Options & { readonly client?: Client }
type CreateData<F> = Parameters<Queries<F>['create']>[0]['data']
type UserRow<F> = Payload<F, {}>

/** password's commands on the user model (D-113). */
export interface PasswordCommands<F> {
	/** Creates the user, its account and its hash; opens no session. */
	signUp(
		args: Credentials & { readonly data: CreateData<F> },
		options?: Options,
	): Promise<UserRow<F>>
	/**
	 * Opens a session; with a `client`, counted and with its cookie as the
	 * signIn function, otherwise never limited.
	 */
	signIn(
		args: Credentials,
		options?: SignInOptions,
	): Promise<SignedIn<UserRow<F>>>
	/**
	 * Replaces the password and ends every session, as Master or as the user.
	 * It takes no current password: check the user's intent first, as
	 * changePassword does.
	 */
	setPassword(
		args: { readonly id: string; readonly password: string },
		options?: Options,
	): Promise<void>
	/**
	 * Checks the user's current password before a sensitive action, as
	 * Master or as the user; opens no session. Always counted: with a
	 * `client` as changePassword, otherwise 10 failures per user (D-161).
	 */
	checkPassword(
		args: { readonly id: string; readonly password: string },
		options?: SignInOptions,
	): Promise<void>
}

/** password's types (D-57). */
export interface Password extends PluginTypes {
	readonly name: 'password'
	readonly requires: Auth
	readonly appOptions: PasswordOptions
	readonly addedFields: {
		readonly emailVerified: Field<boolean, { readonly default: false }>
		/** The password account's email (D-162). */
		readonly email: Field<
			string | null,
			{ readonly optional: true; readonly unique: true }
		>
		/** When the password was last set (D-169). */
		readonly passwordSetAt: Field<Date | null, { readonly optional: true }>
	}
	readonly commands: PasswordCommands<this['fields']>
}

const M = { as: master }
const states = new WeakMap<AuthApi, State>()
/** The `create` of each model whose `use` lists `password()`. */
const using = new WeakSet<object>()

function stateOf(auth: AuthApi): State {
	const state = states.get(auth)
	if (state === undefined) throw new Error('password has not started.')
	return state
}

/** Deletes the user's hash, links and email requests (D-113, D-160). */
async function forget(userId: string): Promise<void> {
	const where = { userId }
	await PasswordHash.deleteMany({ where }, M)
	await PasswordToken.deleteMany({ where }, M)
	const emails = { kind: 'email', subject: userId }
	await PasswordRequest.deleteMany({ where: emails }, M)
}

/** The one model whose `use` lists `password()`. */
function usersOf(models: readonly ExposedModel[]): ExposedModel {
	// oxlint-disable-next-line typescript/unbound-method -- compared by identity, never called.
	const users = models.filter(({ queries }) => using.has(queries.create))
	const [first, second] = users
	if (first === undefined) {
		throw new Refused(
			'passwordPlugin() needs the user model to list it: add `use: [password()]` to defineUser.',
		)
	}
	if (second !== undefined) {
		throw new Refused(
			`${first.schema.name} and ${second.schema.name} both use password(): only the user model does.`,
		)
	}
	return first
}

const reserved = new Set([
	'id',
	'createdAt',
	'updatedAt',
	'email',
	'password',
	'emailVerified',
	'passwordSetAt',
])

/** The listed fields' properties; an unknown, a reserved or a missing one stops startup. */
function signUpFields(
	users: ExposedModel,
	listed: readonly string[],
): ReadonlyMap<string, Property> {
	const { name, fields } = users.schema
	const where = `passwordPlugin({ signUp })`
	const properties = new Map<string, Property>()
	for (const field of listed) {
		const found = fields.find((each) => each.name === field)
		if (found === undefined || reserved.has(field)) {
			throw new Refused(
				`${where}: ${name}.${field} is not a field sign-up may take.`,
			)
		}
		properties.set(
			field,
			fieldProperty(
				found,
				users.required.includes(field),
				where,
				users.validators[field],
			),
		)
	}
	const missing = users.required.filter((field) => !properties.has(field))
	if (missing.length > 0) {
		throw new Refused(
			`${where}: ${name} needs ${missing.join(', ')} to be created; list them.`,
		)
	}
	return properties
}

/** A sign-up's data, checked against the list unless the caller is Master. */
function signUpData(state: State, data: object, caller: Identity): object {
	if (isMaster(caller)) return data
	if (state.signUp === false) {
		throw new PublicError('ACCESS_DENIED', 'Sign-up is closed.')
	}
	const { signUp } = state
	const issues = Object.keys(data)
		.filter((key) => !signUp.has(key))
		.map((key) => ({ path: ['data', key], message: 'Unknown field.' }))
	if (issues.length > 0) {
		throw new PublicError(
			'VALIDATION_FAILED',
			'Sign-up takes the listed fields only.',
			{
				details: { issues },
			},
		)
	}
	return data
}

/** The user model and the sign-up fields, `false` when sign-up is closed. */
function configOf(
	options: PasswordOptions,
	models: readonly ExposedModel[],
): {
	readonly users: ExposedModel
	readonly fields: ReadonlyMap<string, Property> | false
} {
	const users = usersOf(models)
	const listed = options.signUp ?? []
	const fields = listed === false ? false : signUpFields(users, listed)
	return { users, fields }
}

const callerOf = (options: Options | undefined): Identity =>
	options?.as ?? { kind: 'anonymous' }

/** Refuses `command` on user `id` but as Master or as that user. */
function selfOrMaster(
	options: Options | undefined,
	id: string,
	command: string,
): void {
	const caller = callerOf(options)
	const self = caller.kind === 'user' && caller.user.id === id
	if (!self && !isMaster(caller)) {
		throw new PublicError(
			'ACCESS_DENIED',
			`User.${command} runs as Master or as the user.`,
		)
	}
}

const definition = definePlugin<Password>({
	name: 'password',
	manifest,
	requires: { auth: authPlugin },
	models: [PasswordHash, PasswordAttempt, PasswordRequest, PasswordToken],
	addedFields: (f) => ({
		// Only Master confirms an email: rules read it (D-117).
		emailVerified: f.boolean({ default: false }).with({
			access: { create: () => false, update: () => false },
		}),
		// Only Master writes it; the hooks keep the account in step (D-162).
		email: f.string({ optional: true, unique: true }).with({
			access: { read: readsEmail, create: () => false, update: () => false },
		}),
		// Only Master writes it; password sets it with the password (D-169).
		passwordSetAt: f.dateTime({ optional: true }).with({
			access: { read: readsEmail, create: () => false, update: () => false },
		}),
	}),
	hooks: {
		// The email and the password account stay one (D-162).
		beforeCreate: ({ data }) => {
			creating(data)
		},
		afterCreate: async ({ record, plugins }) => {
			await created(stateOf(plugins.auth), record)
		},
		beforeUpdate: async ({ record, data, plugins }) => {
			await updating(stateOf(plugins.auth), record, data)
		},
		afterUpdate: async ({ record, previous, plugins }) => {
			await updated(stateOf(plugins.auth), record, previous)
		},
		afterUpdateCommit: ({ record, previous, plugins }) => {
			committed(stateOf(plugins.auth), record, previous)
		},
		// The user's hash and tokens go with them (D-113, D-117).
		afterDelete: async ({ record }) => {
			await forget(record.id)
		},
	},
	commands: ({ queries, plugins }) => {
		using.add(queries.create)
		return {
			signUp: async ({ email, password, data }, options) => {
				const state = stateOf(plugins.auth)
				const checked = signUpData(state, data, callerOf(options))
				const { user } = await createUser(
					state,
					valid(emailOf, email, 'email'),
					valid(passwordOf, password, 'password'),
					checked,
				)
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the user model's row, created by its own queries.
				return user as UserRow<Password['addedFields']>
			},
			signIn: async ({ email, password }, options) => {
				const state = stateOf(plugins.auth)
				const subject = valid(emailOf, email, 'email')
				const client = options?.client
				const attempt = attemptOf(subject, client)
				const checked = await verified(state, subject, password, attempt)
				const opened = await signedIn(state, checked, client)
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the user model's row, read by its own queries.
				return opened as SignedIn<UserRow<Password['addedFields']>>
			},
			setPassword: async ({ id, password }, options) => {
				selfOrMaster(options, id, 'setPassword')
				const state = stateOf(plugins.auth)
				await setPassword(state, id, valid(passwordOf, password, 'password'))
			},
			checkPassword: async ({ id, password }, options) => {
				selfOrMaster(options, id, 'checkPassword')
				const client = options?.client
				// Counted without a client too: the check guards an action (D-161).
				await checkCurrent(
					id,
					password,
					attemptOf(id, client) ?? { subject: id },
				)
			},
		}
	},
	// The functions are built before the APIs (D-89): they read the state
	// when they run, and `api` stores it once auth's API exists.
	api: ({ options, plugins, models, logger }) => {
		const { users, fields } = configOf(options, models)
		const signUp = fields === false ? false : new Set(fields.keys())
		const { auth } = plugins
		const { sendEmail } = options
		const sending = new Set<Promise<void>>()
		states.set(auth, { auth, users, signUp, logger, sending, sendEmail })
		// A closed account keeps its row, without a password, an email or a
		// verified one (D-160, D-162, D-169).
		auth.onCloseAccount(async (userId) => {
			await forget(userId)
			const where = { id: userId }
			const user = await users.queries.findUnique({ where }, M)
			if (user === null) return
			const { email, emailVerified, passwordSetAt } = user
			if (email === null && emailVerified !== true && passwordSetAt === null) {
				return
			}
			const data = { email: null, emailVerified: false, passwordSetAt: null }
			await users.queries.update({ where, data }, M)
		})
	},
	// The emails under way still query: they end before the database closes.
	stop: async ({ plugins }) => {
		await Promise.all(stateOf(plugins.auth).sending)
	},
	functions: ({ options, plugins, models }) => {
		const { users, fields } = configOf(options, models)
		const state = () => stateOf(plugins.auth)
		const { sendEmail } = options
		const mailer = sendEmail === undefined ? undefined : mailerOf(sendEmail)
		return [
			...passwordFunctions(state, users, fields, mailer),
			...(mailer === undefined ? [] : emailFunctions(state, mailer)),
		]
	},
})

/**
 * The password sign-in method; it requires `authPlugin()`.
 *
 * Known and kept (D-115): `signUp` refuses a taken email with
 * `UNIQUE_VIOLATION`, which tells that the email has an account until email
 * verification can hide it; a hundred failures on one account within 15
 * minutes, from any addresses, lock it for everyone, and a hundred from one
 * address lock that address out of every account (D-114); `SignedIn`
 * holds the token even when the cookie is set.
 */
export const passwordPlugin: PluginOf<Password> = definition.plugin
/** The user model's entry: its commands, and its hash deleted with it. */
export const password: UseOf<Password> = definition.use

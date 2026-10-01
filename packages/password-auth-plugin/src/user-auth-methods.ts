import {
	FrameworkError,
	getCurrentRequest,
	getCurrentUltimaBase,
	type SchemaFields,
	type SchemaReference,
	type SchemaResult,
} from '@ultimabase/core'

import type { PasswordAuthPluginExports } from './application-api.js'
import {
	passwordAuthOperations,
	rejectPasswordSession,
	type PasswordChangeInput,
	type PasswordCredentialsInput,
} from './operations.js'
import type {
	PasswordAuthenticationResult,
	PasswordChangeResult,
	PasswordLogoutResult,
} from './session.js'
import { passwordPrincipal } from './session.js'
import type { PasswordUserDefinition } from './user-schema.js'
import type { PasswordSignUpInput } from './sign-up-input.js'

/** Adds authentication commands to the immutable Password User schema class. */
export interface PasswordUserAuthMethods<
	TFields extends SchemaFields = SchemaFields,
> {
	/**
	 * Reads the currently authenticated User through the ordinary authorization pipeline.
	 * @example `const me = await AppUser.current()`
	 */
	current(): Promise<SchemaResult<PasswordUserDefinition<TFields>>>
	/**
	 * Replaces the current User's password and revokes every other session.
	 * @example `await AppUser.changePassword({ currentPassword, newPassword })`
	 */
	changePassword(input: PasswordChangeInput): Promise<PasswordChangeResult>
	/**
	 * Creates a User, credential, and session atomically, with a required readable profile.
	 * @example `await AppUser.signUp({ username: 'Ada', password })`
	 */
	signUp(
		input: PasswordSignUpInput<TFields>,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Authenticates credentials and returns the readable User and an independent session.
	 * @example `await AppUser.login({ username: 'Ada', password })`
	 */
	login(
		input: PasswordCredentialsInput,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Validates and rotates one session token, returning a freshly read User.
	 * The old token becomes invalid only after a successful commit.
	 * @example `await AppUser.refresh(session.token)`
	 */
	refresh(
		token: string,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Validates and revokes only the supplied session, leaving other sessions active.
	 * @example `await AppUser.logout(session.token)`
	 */
	logout(token: string): Promise<PasswordLogoutResult>
	/**
	 * Revokes every session owned by the currently authenticated User.
	 * @example `await AppUser.logoutEverywhere()`
	 */
	logoutEverywhere(): Promise<PasswordLogoutResult>
}

const selectApplication = (
	schema: SchemaReference<'User'>,
	options: unknown,
): ReturnType<typeof getCurrentUltimaBase> => {
	if (options !== undefined) {
		throw new TypeError(
			'Password User methods do not accept application options',
		)
	}
	const ultimabase = getCurrentUltimaBase()
	if (ultimabase.state !== 'started')
		throw new TypeError(
			'Password User authentication requires a started UltimaBase',
		)
	if (!ultimabase.ownsSchema(schema)) {
		throw new TypeError('Password User is not installed in this application')
	}
	return ultimabase
}

const readCurrentProfile = async <TSchema extends SchemaReference<'User'>>(
	schema: TSchema,
	userId: string,
): Promise<SchemaResult<TSchema>> => {
	const profile = await schema.pointer(userId).findOne()
	if (profile === null) {
		throw new FrameworkError(
			'NOT_FOUND',
			'Password Auth User is not readable.',
			{
				publicMessage: 'The requested object was not found.',
			},
		)
	}
	return profile as unknown as SchemaResult<TSchema>
}

/** Creates inert dispatchers before Core freezes the exact schema class. */
export const createPasswordUserAuthMethods = <TFields extends SchemaFields>(
	schema: SchemaReference<'User'>,
): PasswordUserAuthMethods<TFields> => {
	const withSession = <TResult>(
		token: string,
		options: unknown,
		execute: (
			ultimabase: ReturnType<typeof getCurrentUltimaBase>,
		) => Promise<TResult>,
	): Promise<TResult> => {
		const ultimabase = selectApplication(schema, options)
		const auth = ultimabase.plugin(
			'@ultimabase/password-auth-plugin',
		) as PasswordAuthPluginExports
		// The existing session helper validates ownership and installs anonymous authority.
		return auth.runWithSession(token, () => execute(ultimabase))
	}
	const currentPrincipal = () => {
		try {
			return getCurrentRequest().getValue(passwordPrincipal)
		} catch (error: unknown) {
			if (
				error instanceof FrameworkError &&
				error.code === 'MISSING_EXECUTION_CONTEXT'
			) {
				return undefined
			}
			throw error
		}
	}
	return {
		current: async (
			options?: unknown,
		): Promise<SchemaResult<PasswordUserDefinition<TFields>>> => {
			selectApplication(schema, options)
			const principal = currentPrincipal()
			if (principal === undefined) {
				return rejectPasswordSession()
			}
			if (!Object.is(principal.user.schema, schema)) {
				return rejectPasswordSession()
			}
			return readCurrentProfile(schema, principal.user.id) as Promise<
				SchemaResult<PasswordUserDefinition<TFields>>
			>
		},
		changePassword: async (
			input: PasswordChangeInput,
			options?: unknown,
		): Promise<PasswordChangeResult> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.changePassword)
				.execute(input),
		signUp: async (
			input: PasswordSignUpInput,
			options?: unknown,
		): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.signUp)
				.execute(input) as Promise<
				PasswordAuthenticationResult<PasswordUserDefinition<TFields>>
			>,
		login: async (
			input: PasswordCredentialsInput,
			options?: unknown,
		): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.login)
				.execute(input) as Promise<
				PasswordAuthenticationResult<PasswordUserDefinition<TFields>>
			>,
		refresh: async (
			token: string,
			options?: unknown,
		): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>> =>
			withSession(token, options, (ultimabase) =>
				ultimabase.operation(passwordAuthOperations.refresh).execute(null),
			) as Promise<
				PasswordAuthenticationResult<PasswordUserDefinition<TFields>>
			>,
		logout: async (
			token: string,
			options?: unknown,
		): Promise<PasswordLogoutResult> =>
			withSession(token, options, (ultimabase) =>
				ultimabase.operation(passwordAuthOperations.logout).execute(null),
			),
		logoutEverywhere: async (
			options?: unknown,
		): Promise<PasswordLogoutResult> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.logoutEverywhere)
				.execute(null),
	}
}

import {
	FrameworkError,
	UltimaBase,
	getCurrentRequest,
	getCurrentUltimaBase,
	type OperationOptions,
	type SchemaFields,
	type SchemaReference,
	type SchemaResult,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

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

/** Selects the application for a direct Password User authentication call. */
export interface PasswordUserAuthOptions {
	/**
	 * Temporarily selects the exact User owner during repository migration.
	 * @deprecated Ordinary calls resolve the sole active application.
	 */
	readonly ultimabase?: NonNullable<OperationOptions['ultimabase']>
}

/** Adds authentication commands to the immutable Password User schema class. */
export interface PasswordUserAuthMethods<
	TFields extends SchemaFields = SchemaFields,
> {
	/**
	 * Reads the currently authenticated User through the ordinary authorization pipeline.
	 * @example `const me = await AppUser.current()`
	 */
	current(
		options?: PasswordUserAuthOptions,
	): Promise<SchemaResult<PasswordUserDefinition<TFields>>>
	/**
	 * Replaces the current User's password and revokes every other session.
	 * @example `await AppUser.changePassword({ currentPassword, newPassword })`
	 */
	changePassword(
		input: PasswordChangeInput,
		options?: PasswordUserAuthOptions,
	): Promise<PasswordChangeResult>
	/**
	 * Creates a User, credential, and session atomically, with a required readable profile.
	 * @example `await AppUser.signUp({ username: 'Ada', password })`
	 */
	signUp(
		input: PasswordSignUpInput<TFields>,
		options?: PasswordUserAuthOptions,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Authenticates credentials and returns the readable User and an independent session.
	 * @example `await AppUser.login({ username: 'Ada', password })`
	 */
	login(
		input: PasswordCredentialsInput,
		options?: PasswordUserAuthOptions,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Validates and rotates one session token, returning a freshly read User.
	 * The old token becomes invalid only after a successful commit.
	 * @example `await AppUser.refresh(session.token)`
	 */
	refresh(
		token: string,
		options?: PasswordUserAuthOptions,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Validates and revokes only the supplied session, leaving other sessions active.
	 * @example `await AppUser.logout(session.token)`
	 */
	logout(
		token: string,
		options?: PasswordUserAuthOptions,
	): Promise<PasswordLogoutResult>
	/**
	 * Revokes every session owned by the currently authenticated User.
	 * @example `await AppUser.logoutEverywhere()`
	 */
	logoutEverywhere(
		options?: PasswordUserAuthOptions,
	): Promise<PasswordLogoutResult>
}

// A precise guard avoids erasing the facade's schema and plugin tuple types.
const isApplicationFacade = (
	value: unknown,
): value is NonNullable<OperationOptions['ultimabase']> =>
	value instanceof UltimaBase

const selectApplication = (
	schema: SchemaReference<'User'>,
	options: PasswordUserAuthOptions | undefined,
): NonNullable<OperationOptions['ultimabase']> => {
	if (
		options !== undefined &&
		(!isPlainRecord(options) ||
			Reflect.ownKeys(options).some((key) => key !== 'ultimabase'))
	) {
		throw new TypeError('Password User auth options accept only ultimabase')
	}
	const explicit = options?.ultimabase
	if (explicit !== undefined && !isApplicationFacade(explicit)) {
		throw new TypeError(
			'Password User auth ultimabase must be an UltimaBase instance',
		)
	}
	if (explicit !== undefined) {
		let active: ReturnType<typeof getCurrentUltimaBase> | undefined
		try {
			active = getCurrentUltimaBase()
		} catch (error: unknown) {
			if (!(
				error instanceof FrameworkError &&
				error.code === 'MISSING_EXECUTION_CONTEXT'
			))
				throw error
		}
		if (active !== undefined && active !== explicit) {
			throw new FrameworkError(
				'VALIDATION_ERROR',
				'Explicit authentication ownership cannot replace the active application.',
			)
		}
	}
	const ultimabase = explicit ?? getCurrentUltimaBase()
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
		options: PasswordUserAuthOptions | undefined,
		execute: (
			ultimabase: NonNullable<OperationOptions['ultimabase']>,
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
			options?: PasswordUserAuthOptions,
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
			options?: PasswordUserAuthOptions,
		): Promise<PasswordChangeResult> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.changePassword)
				.execute(input),
		signUp: async (
			input: PasswordSignUpInput,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.signUp)
				.execute(input) as Promise<
				PasswordAuthenticationResult<PasswordUserDefinition<TFields>>
			>,
		login: async (
			input: PasswordCredentialsInput,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.login)
				.execute(input) as Promise<
				PasswordAuthenticationResult<PasswordUserDefinition<TFields>>
			>,
		refresh: async (
			token: string,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>> =>
			withSession(token, options, (ultimabase) =>
				ultimabase.operation(passwordAuthOperations.refresh).execute(null),
			) as Promise<
				PasswordAuthenticationResult<PasswordUserDefinition<TFields>>
			>,
		logout: async (
			token: string,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordLogoutResult> =>
			withSession(token, options, (ultimabase) =>
				ultimabase.operation(passwordAuthOperations.logout).execute(null),
			),
		logoutEverywhere: async (
			options?: PasswordUserAuthOptions,
		): Promise<PasswordLogoutResult> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.logoutEverywhere)
				.execute(null),
	}
}

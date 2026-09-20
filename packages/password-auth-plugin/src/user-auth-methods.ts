import {
	FrameworkError,
	UltimaBase,
	getCurrentApplication,
	getCurrentUltimaBase,
	type OperationOptions,
	type SchemaFields,
	type SchemaReference,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import type { PasswordAuthPluginExports } from './application-api.js'
import {
	passwordAuthOperations,
	type PasswordCredentialsInput,
} from './operations.js'
import type {
	PasswordAuthenticationResult,
	PasswordLogoutResult,
} from './session.js'
import type { PasswordUserDefinition } from './user-schema.js'
import type { PasswordSignUpInput } from './sign-up-input.js'

/** Selects the application for a direct Password User authentication call. */
export interface PasswordUserAuthOptions {
	/**
	 * The started application owning this exact User. Required outside a request.
	 * @example `await AppUser.login(credentials, { ultimabase })`
	 */
	readonly ultimabase?: NonNullable<OperationOptions['ultimabase']>
}

/** Adds authentication commands to the immutable Password User schema class. */
export interface PasswordUserAuthMethods<
	TFields extends SchemaFields = SchemaFields,
> {
	/**
	 * Creates a User, credential, and session atomically, with a required readable profile.
	 * @example `await AppUser.signUp({ username: 'Ada', password }, { ultimabase })`
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
	 * @example `await AppUser.refresh(session.token, { ultimabase })`
	 */
	refresh(
		token: string,
		options?: PasswordUserAuthOptions,
	): Promise<PasswordAuthenticationResult<PasswordUserDefinition<TFields>>>
	/**
	 * Validates and revokes only the supplied session, leaving other sessions active.
	 * @example `await AppUser.logout(session.token, { ultimabase })`
	 */
	logout(
		token: string,
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
		let active: ReturnType<typeof getCurrentApplication> | undefined
		try {
			active = getCurrentApplication()
		} catch (error: unknown) {
			if (!(
				error instanceof FrameworkError &&
				error.code === 'MISSING_EXECUTION_CONTEXT'
			))
				throw error
		}
		if (active !== undefined && active !== explicit.application) {
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
	if (ultimabase.application.schemas.get('User') !== schema) {
		throw new TypeError('Password User is not installed in this application')
	}
	return ultimabase
}

/** Creates inert dispatchers before Core freezes the exact schema class. */
export const createPasswordUserAuthMethods = (
	schema: SchemaReference<'User'>,
) => {
	const withSession = <TResult>(
		token: string,
		options: PasswordUserAuthOptions | undefined,
		execute: (
			ultimabase: NonNullable<OperationOptions['ultimabase']>,
		) => Promise<TResult>,
	): Promise<TResult> => {
		const ultimabase = selectApplication(schema, options)
		const auth = ultimabase.application.getPlugin(
			'@ultimabase/password-auth-plugin',
		) as PasswordAuthPluginExports
		// The existing session helper validates ownership and installs anonymous authority.
		return auth.runWithSession(token, () => execute(ultimabase))
	}
	return {
		signUp: async (
			input: PasswordSignUpInput,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordAuthenticationResult> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.signUp)
				.execute(input),
		login: async (
			input: PasswordCredentialsInput,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordAuthenticationResult> =>
			selectApplication(schema, options)
				.operation(passwordAuthOperations.login)
				.execute(input),
		refresh: async (
			token: string,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordAuthenticationResult> =>
			withSession(token, options, (ultimabase) =>
				ultimabase.operation(passwordAuthOperations.refresh).execute(null),
			),
		logout: async (
			token: string,
			options?: PasswordUserAuthOptions,
		): Promise<PasswordLogoutResult> =>
			withSession(token, options, (ultimabase) =>
				ultimabase.operation(passwordAuthOperations.logout).execute(null),
			),
	}
}

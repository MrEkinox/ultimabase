import {
	getCurrentUltimaBase,
	type Model,
	type SchemaDefinition,
	type SchemaReference,
} from '@ultimabase/core'
import type {
	PluginOperationDefinition,
	PluginOperationInput,
	PluginOperationResult,
} from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import type { AuthPluginExports } from './application-api.js'
import type { AuthStaticsServices } from './method.js'
import {
	authOperations,
	type AuthDeleteAccountResult,
	type AuthLogoutResult,
	type AuthMethodList,
	type AuthSessionList,
	type AuthUnlinkResult,
} from './operations.js'
import type { AuthenticationResult } from './session.js'

/** Static members every User class gains from the foundation. */
export interface AuthUserStatics<TSchema extends SchemaDefinition> {
	/**
	 * Reads the authenticated user through the ordinary read rules.
	 * @example `const me = await TodoUser.current()`
	 */
	current(): Promise<Model<TSchema>>
	/**
	 * Rotates one session token and rereads the user.
	 * @example `const { session } = await TodoUser.refresh(token)`
	 */
	refresh(token: string): Promise<AuthenticationResult<TSchema>>
	/**
	 * Revokes only this session.
	 * @example `await TodoUser.logout(token)`
	 */
	logout(token: string): Promise<AuthLogoutResult>
	/**
	 * Revokes every session of the authenticated user.
	 * @example `await TodoUser.logoutEverywhere()`
	 */
	logoutEverywhere(): Promise<AuthLogoutResult>
	/**
	 * Lists the live sessions of the authenticated user.
	 * @example `const { sessions } = await TodoUser.listSessions()`
	 */
	listSessions(): Promise<AuthSessionList>
	/**
	 * Revokes one session of the authenticated user.
	 * @example `await TodoUser.revokeSession(sessionId)`
	 */
	revokeSession(id: string): Promise<AuthLogoutResult>
	/**
	 * Lists the sign-in methods linked to the authenticated user.
	 * @example `const { methods } = await TodoUser.listMethods()`
	 */
	listMethods(): Promise<AuthMethodList>
	/**
	 * Removes one linked sign-in method; never the last one. Requires a recent login.
	 * @example `await TodoUser.unlinkMethod(methodId)`
	 */
	unlinkMethod(id: string): Promise<AuthUnlinkResult>
	/**
	 * Deletes the authenticated user, its sessions, linked methods and secrets.
	 * Requires a recent login.
	 * @example `await TodoUser.deleteAccount()`
	 */
	deleteAccount(): Promise<AuthDeleteAccountResult>
}

type Application = ReturnType<typeof getCurrentUltimaBase>

/** Resolves the sole started application that owns this exact User class. */
const selectApplication = (schema: SchemaDefinition): Application => {
	const ultimabase = getCurrentUltimaBase()
	if (ultimabase.state !== 'started') {
		throw new TypeError('User authentication requires a started UltimaBase')
	}
	if (!ultimabase.ownsSchema(schema)) {
		throw new TypeError('This User schema is not installed in the application')
	}
	return ultimabase
}

/** Creates the services a method's statics use for one User class. */
export const createStaticsServices = (
	schema: SchemaReference<string>,
): AuthStaticsServices =>
	immutableRecord({
		schema,
		execute: <const TOperation extends PluginOperationDefinition>(
			operation: TOperation,
			input: PluginOperationInput<TOperation>,
		): Promise<PluginOperationResult<TOperation>> =>
			selectApplication(schema).operation(operation).execute(input),
	})

/** Creates the foundation's static members for one User class. */
export const createUserStatics = (
	schema: SchemaReference<string>,
	pluginId: string,
): Readonly<Record<string, unknown>> => {
	const { execute } = createStaticsServices(schema)
	const withSession = <TResult>(
		token: string,
		run: () => Promise<TResult>,
	): Promise<TResult> => {
		const auth = selectApplication(schema).plugin(pluginId) as AuthPluginExports
		return auth.runWithSession(token, run)
	}
	return immutableRecord({
		current: () => execute(authOperations.current, null),
		refresh: (token: string) =>
			withSession(token, () => execute(authOperations.refresh, null)),
		logout: (token: string) =>
			withSession(token, () => execute(authOperations.logout, null)),
		logoutEverywhere: () => execute(authOperations.logoutEverywhere, null),
		listSessions: () => execute(authOperations.listSessions, null),
		revokeSession: (id: string) =>
			execute(authOperations.revokeSession, { id }),
		listMethods: () => execute(authOperations.listMethods, null),
		unlinkMethod: (id: string) => execute(authOperations.unlinkMethod, { id }),
		deleteAccount: () => execute(authOperations.deleteAccount, null),
	})
}

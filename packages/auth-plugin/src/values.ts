import {
	defineOperationValue,
	defineTypegenReference,
	type PluginOperationValueContract,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { isAuthPrincipal } from './principal.js'
import { isSessionToken, type AuthenticationResult } from './session.js'

const reference = (exportName: string) =>
	defineTypegenReference({ exportName, module: '@ultimabase/auth-plugin' })

/** The `null` input of operations that read only the session. */
export const nullInput: PluginOperationValueContract<null> =
	defineOperationValue<null>((value, path) => {
		if (value !== null) throw new TypeError(`${path} must be null`)
		return null
	})

/** One input with exactly the given string fields. */
export const stringFieldsInput = <const TName extends string>(
	names: readonly TName[],
	exportName?: string,
): PluginOperationValueContract<Readonly<Record<TName, string>>> =>
	defineOperationValue<Readonly<Record<TName, string>>>(
		(value, path) => {
			if (
				!isPlainRecord(value) ||
				Object.keys(value).length !== names.length ||
				names.some((name) => typeof value[name] !== 'string')
			) {
				throw new TypeError(`${path} must contain exactly ${names.join(', ')}`)
			}
			return immutableRecord(
				Object.fromEntries(names.map((name) => [name, value[name]])),
			) as Readonly<Record<TName, string>>
		},
		...(exportName === undefined ? [] : [reference(exportName)]),
	)

/** The input naming one record by id. */
export const idInput: PluginOperationValueContract<
	Readonly<Record<'id', string>>
> = stringFieldsInput(['id'], 'AuthIdInput')

/** Accepts one acknowledgement such as `{ revoked: true }`. */
export const acknowledgement = <const TKey extends string>(
	key: TKey,
	exportName: string,
): PluginOperationValueContract<Readonly<Record<TKey, true>>> =>
	defineOperationValue<Readonly<Record<TKey, true>>>((value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 1 ||
			value[key] !== true
		) {
			throw new TypeError(`${path} must be { ${key}: true }`)
		}
		return immutableRecord({ [key]: true }) as Readonly<Record<TKey, true>>
	}, reference(exportName))

/** A readable User profile: frozen plain data (ADR-0310). */
export const profileResult: PluginOperationValueContract<
	Readonly<Record<string, unknown>>
> = defineOperationValue<Readonly<Record<string, unknown>>>((value, path) => {
	if (
		!isPlainRecord(value) ||
		!Object.isFrozen(value) ||
		typeof value.id !== 'string'
	) {
		throw new TypeError(`${path} must be a User profile`)
	}
	return value
})

/** The result of sign-up, login and refresh. */
export const authenticationResult: PluginOperationValueContract<AuthenticationResult> =
	defineOperationValue<AuthenticationResult>((value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 3 ||
			!isAuthPrincipal(value.principal) ||
			!isPlainRecord(value.user) ||
			!Object.isFrozen(value.user) ||
			value.user.id !== value.principal.user.id ||
			!isPlainRecord(value.session) ||
			Object.keys(value.session).length !== 4 ||
			typeof value.session.absoluteExpiresAt !== 'string' ||
			typeof value.session.expiresAt !== 'string' ||
			typeof value.session.id !== 'string' ||
			!isSessionToken(value.session.token)
		) {
			throw new TypeError(`${path} must be an authentication result`)
		}
		return immutableRecord({
			principal: value.principal,
			session: immutableRecord({
				absoluteExpiresAt: value.session.absoluteExpiresAt,
				expiresAt: value.session.expiresAt,
				id: value.session.id,
				token: value.session.token,
			}),
			user: value.user,
		}) as AuthenticationResult
	}, reference('AuthenticationResult'))

/** Accepts one list result such as `{ sessions: [...] }` of frozen records. */
export const listResult = <const TKey extends string, TItem>(
	key: TKey,
	exportName: string,
): PluginOperationValueContract<Readonly<Record<TKey, readonly TItem[]>>> =>
	defineOperationValue<Readonly<Record<TKey, readonly TItem[]>>>(
		(value, path) => {
			const items: unknown = isPlainRecord(value) ? value[key] : undefined
			if (
				!isPlainRecord(value) ||
				Object.keys(value).length !== 1 ||
				!Array.isArray(items) ||
				!Object.isFrozen(items) ||
				!items.every((item) => isPlainRecord(item) && Object.isFrozen(item))
			) {
				throw new TypeError(`${path} must be { ${key}: [...] }`)
			}
			const result: Readonly<Record<string, readonly unknown[]>> =
				immutableRecord({ [key]: items })
			return result as Readonly<Record<TKey, readonly TItem[]>>
		},
		reference(exportName),
	)

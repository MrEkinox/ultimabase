import { Pointer, type SchemaDefinition } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { PasswordUserReference } from './user-schema.js'

declare const passwordPrincipalBrand: unique symbol

const passwordPrincipals = new WeakSet<object>()

/** Carries only the exact typed User pointer established by Password Auth. */
export interface PasswordPrincipal<
	TUser extends SchemaDefinition = PasswordUserReference,
> {
	readonly [passwordPrincipalBrand]: TUser
	readonly user: Pointer<TUser>
}

/** Creates immutable principal state only after credential verification. */
export const createPasswordPrincipal = <TUser extends SchemaDefinition>(
	user: Pointer<TUser>,
): PasswordPrincipal<TUser> => {
	if (!Pointer.is(user)) {
		throw new TypeError('Password principal requires a Core Pointer')
	}
	const principal = immutableRecord({ user }) as PasswordPrincipal<TUser>
	passwordPrincipals.add(principal)
	return principal
}

/** Rejects structural lookalikes at later request-context boundaries. */
export const isPasswordPrincipal = (
	value: unknown,
): value is PasswordPrincipal =>
	typeof value === 'object' &&
	value !== null &&
	passwordPrincipals.has(value) &&
	Pointer.is(Reflect.get(value, 'user'))

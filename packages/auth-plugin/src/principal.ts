import { Pointer, type SchemaDefinition } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

declare const authPrincipalBrand: unique symbol

const authPrincipals = new WeakSet<object>()

/** Carries only the typed User pointer established by an authentication method. */
export interface AuthPrincipal<
	TUser extends SchemaDefinition = SchemaDefinition,
> {
	readonly [authPrincipalBrand]: TUser
	readonly user: Pointer<TUser>
}

/** Creates immutable principal state only after credential verification. */
export const createAuthPrincipal = <TUser extends SchemaDefinition>(
	user: Pointer<TUser>,
): AuthPrincipal<TUser> => {
	if (!Pointer.is(user)) {
		throw new TypeError('Auth principal requires a Core Pointer')
	}
	const principal = immutableRecord({ user }) as AuthPrincipal<TUser>
	authPrincipals.add(principal)
	return principal
}

/** Rejects structural lookalikes at later request-context boundaries. */
export const isAuthPrincipal = (value: unknown): value is AuthPrincipal =>
	typeof value === 'object' &&
	value !== null &&
	authPrincipals.has(value) &&
	Pointer.is(Reflect.get(value, 'user'))

import {
	defineSchemaOption,
	type SchemaOptionDefinition,
} from '@ultimabase/core/plugin'

const authUserIdentityBrand: unique symbol = Symbol('AuthUserIdentity')
const identityClassNames = new WeakMap<object, string>()

/** The opaque marker `App.UserSchema.define()` puts on the User schema. */
interface AuthUserIdentityOption {
	readonly [authUserIdentityBrand]: true
}

class AuthUserIdentityValue implements AuthUserIdentityOption {
	readonly [authUserIdentityBrand] = true as const

	constructor() {
		Object.freeze(this)
	}
}

/** Names the direct schema option set by `App.UserSchema.define()`. */
export const authUserIdentityOptionName = 'ultimabase.auth.user' as const

/** Creates one marker that application code cannot construct. */
export const createAuthUserIdentity = (
	className: string,
): AuthUserIdentityOption => {
	const identity = new AuthUserIdentityValue()
	identityClassNames.set(identity, className)
	return identity
}

/**
 * Owns the marker that designates the User schema: it requires `authPlugin`,
 * and lets transports find the User whatever its class name.
 */
export const authUserIdentityOption: SchemaOptionDefinition<AuthUserIdentityOption> =
	defineSchemaOption({
		normalize: (value: unknown, path: string): AuthUserIdentityOption => {
			// Only markers created for this exact schema path are accepted.
			if (
				!(value instanceof AuthUserIdentityValue) ||
				identityClassNames.get(value) !==
					path.slice(0, -`.${authUserIdentityOptionName}`.length)
			) {
				throw new TypeError(
					`${path} must be created by App.UserSchema.define()`,
				)
			}
			return value
		},
		protocolVersion: 1,
		valueKind: 'opaque',
	})

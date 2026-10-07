import {
	defineSchemaOption,
	type SchemaOptionDefinition,
} from '@ultimabase/core'

const roleSchemaIdentityBrand: unique symbol = Symbol('RoleSchemaIdentity')
const roleSchemaClassNames = new WeakMap<object, string>()

/**
 * Carries the opaque Typegen contract for RoleSchema's plugin-owned marker.
 *
 * Application code cannot construct this nominal value. `RoleSchema.define()`
 * creates it so static compilation can require the official Roles plugin.
 */
interface RoleSchemaIdentityOption {
	readonly [roleSchemaIdentityBrand]: true
}

class RoleSchemaIdentityValue implements RoleSchemaIdentityOption {
	readonly [roleSchemaIdentityBrand] = true as const

	constructor() {
		Object.freeze(this)
	}
}

/** Names the package-private direct option inserted by `RoleSchema.define()`. */
export const roleSchemaIdentityOptionName = 'ultimabase.roles.identity' as const

/** Creates one exact package-owned marker without exposing authoring syntax. */
export const createRoleSchemaIdentity = (
	className: string,
): RoleSchemaIdentityOption => {
	const identity = new RoleSchemaIdentityValue()
	roleSchemaClassNames.set(identity, className)
	return identity
}

const normalizeRoleSchemaIdentity = (
	value: unknown,
	path: string,
): RoleSchemaIdentityOption => {
	if (
		typeof value !== 'object' ||
		value === null ||
		roleSchemaClassNames.get(value) !==
			path.slice(0, -`.${roleSchemaIdentityOptionName}`.length)
	) {
		throw new TypeError(`${path} must be created by RoleSchema.define()`)
	}

	return value as RoleSchemaIdentityOption
}

/** Owns the nominal direct option that makes Roles installation mandatory. */
export const roleSchemaIdentityOption: SchemaOptionDefinition<RoleSchemaIdentityOption> =
	defineSchemaOption({
		normalize: normalizeRoleSchemaIdentity,
		protocolVersion: 1,
		typegen: false,
		valueKind: 'opaque',
	})

import type { Pointer } from '@ultimabase/core'
import {
	defineSchemaOption,
	type SchemaOptionDefinition,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { normalizeRoleName } from './role-reference.js'
import type {
	RoleCurrentMemberInput,
	RoleReferenceDeletionPolicy,
} from './role-schema.js'

/**
 * How Roles treats one role schema, set in
 * `.with((plugins) => plugins.roles({ … }))` (ADR-0339).
 */
export interface RoleRules {
	/**
	 * Role names created at `start()` when missing; existing roles are left
	 * unchanged.
	 * @example `ensure: ['admin', 'editor']`
	 */
	readonly ensure?: readonly string[]
	/**
	 * Controls references registered by independent consumer plugins when a
	 * role is deleted: `fail` (the default) refuses the deletion, `preserve`
	 * leaves them inert, `cascade` asks their owners to remove them in the
	 * same transaction (Master only).
	 * @default "fail"
	 * @example `deletion: 'cascade'`
	 */
	readonly deletion?: RoleReferenceDeletionPolicy
	/**
	 * Replaces the current member for special cases. Omitted, the current
	 * member is the request principal when it belongs to the member schema
	 * (ADR-0304).
	 * @example `resolveCurrent: ({ context }) => readDelegate(context)`
	 */
	readonly resolveCurrent?: (
		input: RoleCurrentMemberInput,
	) => Pointer | undefined | Promise<Pointer | undefined>
}

/**
 * Contributes `roles` to `.with((plugins) => …)` of the schemas declared by
 * `App.RoleSchema.define` (ADR-0339).
 */
export interface RoleSchemaRules extends SchemaRulesHKT {
	readonly rules: 'RoleSchema' extends keyof this['shape']
		? Readonly<{
				/**
				 * Configures the role schema: roles created at start, the
				 * deletion policy of foreign references, the current member.
				 * @example `.with((plugins) => plugins.roles({ ensure: ['admin'] }))`
				 */
				roles?: RoleRules
			}>
		: Readonly<Record<never, never>>
}

/** The normalized `roles` rule of one role schema. */
export interface NormalizedRoleRules {
	readonly ensure?: readonly string[]
	readonly deletion?: RoleReferenceDeletionPolicy
	readonly resolveCurrent?: (input: RoleCurrentMemberInput) => unknown
}

/** Option name of the `roles` rule. */
export const roleRulesOptionName = 'roles'

const roleRuleKeys = new Set(['deletion', 'ensure', 'resolveCurrent'])

// Class names declared by `App.RoleSchema.define`: `roles` applies to them only.
const roleClassNames = new Set<string>()

/** @internal Records one class name declared by `App.RoleSchema.define`. */
export const recordRoleClassName = (className: string): void => {
	roleClassNames.add(className)
}

/** Reads one deletion policy (`fail` when omitted). */
export const readDeletionPolicy = (
	value: unknown,
): RoleReferenceDeletionPolicy => {
	if (value === undefined) return 'fail'
	if (value !== 'fail' && value !== 'preserve' && value !== 'cascade') {
		throw new TypeError('deletion must be "fail", "preserve", or "cascade"')
	}
	return value
}

/** Reads the role names created at start, in canonical form and once each. */
export const readEnsure = (value: unknown): readonly string[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('ensure must be a list of role names')
	}
	// Names are stored in their canonical form, so duplicates collapse here.
	return immutableArray([
		...new Set(
			value.map((name) => {
				if (typeof name !== 'string') {
					throw new TypeError('ensure must be a list of role names')
				}
				return normalizeRoleName(name)
			}),
		),
	])
}

const normalizeRoleRules = (
	value: unknown,
	path: string,
): NormalizedRoleRules => {
	const className = path.slice(0, -`.${roleRulesOptionName}`.length)
	if (!roleClassNames.has(className)) {
		throw new TypeError(
			`${path} applies only to schemas declared by App.RoleSchema.define`,
		)
	}
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	const unknownKey = Object.keys(value).find((key) => !roleRuleKeys.has(key))
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} option: ${unknownKey}`)
	}
	const { resolveCurrent } = value
	if (resolveCurrent !== undefined && typeof resolveCurrent !== 'function') {
		throw new TypeError(`${path}.resolveCurrent must be a function`)
	}
	return Object.freeze({
		...(value.ensure === undefined ? {} : { ensure: readEnsure(value.ensure) }),
		...(value.deletion === undefined
			? {}
			: { deletion: readDeletionPolicy(value.deletion) }),
		...(resolveCurrent === undefined
			? {}
			: {
					resolveCurrent: resolveCurrent as (
						input: RoleCurrentMemberInput,
					) => unknown,
				}),
	})
}

/** Owns the `roles` rule of `.with((plugins) => plugins.roles({ … }))`. */
export const roleRulesOption: SchemaOptionDefinition<NormalizedRoleRules> =
	defineSchemaOption({
		normalize: normalizeRoleRules,
		protocolVersion: 1,
		valueKind: 'opaque',
	})

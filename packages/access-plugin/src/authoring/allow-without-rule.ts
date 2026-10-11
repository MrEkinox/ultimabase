import type { PolicyPredicate } from '@ultimabase/core'
import {
	readDeploymentEnvironment,
	type DeploymentEnvironment,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { isRuleCallback, type ErasedAccessRule } from './declarations.js'

/**
 * Opens an operation that has no schema rule (ADR-0317): `true` everywhere,
 * production included; `'development'` outside production only (production
 * refuses to start); a `PolicyPredicate` such as `isAuthenticated` when it
 * allows; `false` keeps it denied.
 */
export type AllowWithoutRuleValue = boolean | 'development' | PolicyPredicate

/**
 * Operations that Access allows when a schema has no rule for them; anything
 * not opened here is denied. An operation key wins over its group, a group
 * over `all`, and a schema rule always wins.
 *
 * @example
 * ```ts
 * accessPlugin({ allowWithoutRule: { all: true, write: false } })
 * accessPlugin({ allowWithoutRule: { read: true, count: false, write: isAuthenticated } })
 * accessPlugin({ allowWithoutRule: { all: 'development' } })
 * ```
 */
export interface AllowWithoutRule {
	/** Every native operation and request plugin command; never a plugin permission. */
	readonly all?: AllowWithoutRuleValue
	/** The reads `one`, `many`, `count` and `exists`. */
	readonly read?: AllowWithoutRuleValue
	readonly one?: AllowWithoutRuleValue
	readonly many?: AllowWithoutRuleValue
	readonly count?: AllowWithoutRuleValue
	readonly exists?: AllowWithoutRuleValue
	/** `create`, `update`, `upsert`, `delete` and request plugin commands. */
	readonly write?: AllowWithoutRuleValue
	readonly create?: AllowWithoutRuleValue
	readonly update?: AllowWithoutRuleValue
	readonly upsert?: AllowWithoutRuleValue
	readonly delete?: AllowWithoutRuleValue
	/**
	 * A request plugin command (`softDeleteOne`) or a plugin permission
	 * (`readDeleted`) by name; a permission is opened only by its own key.
	 */
	readonly [key: string]: AllowWithoutRuleValue | undefined
}

/** The value one resolved opening applies: always, or when its predicate allows. */
export interface AccessOpening {
	/** The `allowWithoutRule` key that decided, for diagnostics. */
	readonly key: string
	readonly rule: true | ErasedAccessRule
}

/** Group an operation falls back to when its own key is absent. */
export type AccessOpeningGroup = 'read' | 'write'

type ConfiguredValue = boolean | 'development' | ErasedAccessRule

/** The normalized `allowWithoutRule` option of one Access plugin instance. */
export interface AllowWithoutRulePlan {
	/** The deployment environment read when the plugin was created (ADR-0312). */
	readonly environment: DeploymentEnvironment
	/** Configured keys whose value is not `false`, in declaration order. */
	readonly openings: readonly Readonly<{
		key: string
		value: Exclude<ConfiguredValue, false>
	}>[]
	/** Configured keys that name plugin commands or permissions. */
	readonly extensionKeys: readonly string[]
	/**
	 * Resolves the opening of one operation: its own key, then its group, then
	 * `all`. Without a group (plugin permissions), only its own key counts.
	 */
	resolve(key: string, group?: AccessOpeningGroup): AccessOpening | undefined
}

/** Keys Access defines itself; any other key names a plugin command or permission. */
export const nativeOpeningKeys: ReadonlySet<string> = new Set([
	'all',
	'count',
	'create',
	'delete',
	'exists',
	'many',
	'one',
	'read',
	'update',
	'upsert',
	'write',
])

const keyPattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

const normalizeValue = (value: unknown, key: string): ConfiguredValue => {
	// A function is a `PolicyPredicate`; its result is checked when it runs.
	if (
		typeof value === 'boolean' ||
		value === 'development' ||
		isRuleCallback(value)
	) {
		return value
	}
	throw new TypeError(
		`Access allowWithoutRule.${key} must be true, false, 'development' or a predicate`,
	)
}

/** Validates `allowWithoutRule` once, when the plugin is created. */
export const normalizeAllowWithoutRule = (
	value: unknown,
): AllowWithoutRulePlan => {
	if (value !== undefined && !isPlainRecord(value)) {
		throw new TypeError('Access allowWithoutRule must be a plain object')
	}
	// User-controlled keys live in a Map, never as object properties.
	const configured = new Map<string, ConfiguredValue>()
	for (const key of Reflect.ownKeys(value ?? {})) {
		if (typeof key !== 'string' || !keyPattern.test(key)) {
			throw new TypeError(
				`Access allowWithoutRule contains an invalid key: ${String(key)}`,
			)
		}
		configured.set(key, normalizeValue(Reflect.get(value ?? {}, key), key))
	}
	const environment = readDeploymentEnvironment()
	// One stable opening per deciding key, so diagnostics keep its identity.
	const openings = new Map<string, AccessOpening>()
	for (const [key, configuredValue] of configured) {
		if (
			configuredValue === false ||
			(configuredValue === 'development' && environment === 'production')
		) {
			continue
		}
		openings.set(
			key,
			immutableRecord({
				key,
				rule: typeof configuredValue === 'function' ? configuredValue : true,
			}),
		)
	}

	return immutableRecord({
		environment,
		extensionKeys: immutableArray(
			[...configured.keys()].filter((key) => !nativeOpeningKeys.has(key)),
		),
		openings: immutableArray(
			[...configured].flatMap(([key, configuredValue]) =>
				configuredValue === false
					? []
					: [immutableRecord({ key, value: configuredValue })],
			),
		),
		resolve: (key: string, group?: AccessOpeningGroup) => {
			const chain = group === undefined ? [key] : [key, group, 'all']
			const decidingKey = chain.find((candidate) => configured.has(candidate))
			return decidingKey === undefined ? undefined : openings.get(decidingKey)
		},
	})
}

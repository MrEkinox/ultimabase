import type { PolicyPredicate } from '@ultimabase/core'
import {
	resolveCommandKey,
	type CommandKeyEntry,
} from '@ultimabase/core/plugin'
import {
	readDeploymentEnvironment,
	type DeploymentEnvironment,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	assertNoNativeWriteMethod,
	isRuleCallback,
	type ErasedAccessRule,
} from './declarations.js'

/**
 * Opens an operation that has no schema rule (ADR-0317): `true` everywhere,
 * production included; `'development'` outside production only (production
 * refuses to start); a `PolicyPredicate` such as `isAuthenticated` when it
 * allows; `false` keeps it denied.
 */
export type AllowWithoutRuleValue = boolean | 'development' | PolicyPredicate

/**
 * Operations that Access allows when a schema has no rule for them; anything
 * not opened here is denied. Keys follow the operation vocabulary
 * (ADR-0347): the most precise wins (a read method over its operation, an
 * operation over its group, a group over `all`), and a schema rule always
 * wins. Write methods such as `createMany` are not keys: a write opening
 * never depends on cardinality.
 *
 * @example
 * ```ts
 * accessPlugin({ allowWithoutRule: { all: true, write: false } })
 * accessPlugin({ allowWithoutRule: { read: true, findMany: false, write: isAuthenticated } })
 * accessPlugin({ allowWithoutRule: { all: 'development' } })
 * ```
 */
export interface AllowWithoutRule {
	/** Every native operation and request plugin operation; never a plugin permission. */
	readonly all?: AllowWithoutRuleValue
	/** The reads `find`, `count` and `exists`. */
	readonly read?: AllowWithoutRuleValue
	/** `findOne` and `findMany`. */
	readonly find?: AllowWithoutRuleValue
	/** Reading one row. */
	readonly findOne?: AllowWithoutRuleValue
	/** Listing rows. */
	readonly findMany?: AllowWithoutRuleValue
	readonly count?: AllowWithoutRuleValue
	readonly exists?: AllowWithoutRuleValue
	/** `create`, `update`, `upsert`, `delete` and request plugin operations. */
	readonly write?: AllowWithoutRuleValue
	readonly create?: AllowWithoutRuleValue
	readonly update?: AllowWithoutRuleValue
	readonly upsert?: AllowWithoutRuleValue
	readonly delete?: AllowWithoutRuleValue
	/** Not a key: a write never depends on cardinality, use `create`. */
	readonly createOne?: never
	/** Not a key: a write never depends on cardinality, use `create`. */
	readonly createMany?: never
	/** Not a key: a write never depends on cardinality, use `update`. */
	readonly updateOne?: never
	/** Not a key: a write never depends on cardinality, use `update`. */
	readonly updateMany?: never
	/** Not a key: a write never depends on cardinality, use `upsert`. */
	readonly upsertOne?: never
	/** Not a key: a write never depends on cardinality, use `upsert`. */
	readonly upsertMany?: never
	/** Not a key: a write never depends on cardinality, use `delete`. */
	readonly deleteOne?: never
	/** Not a key: a write never depends on cardinality, use `delete`. */
	readonly deleteMany?: never
	/**
	 * A request plugin operation (`softDelete`, covering `softDeleteOne` and
	 * `softDeleteMany`) or a plugin permission (`readDeleted`) by name; a
	 * permission is opened only by its own key.
	 */
	readonly [key: string]: AllowWithoutRuleValue | undefined
}

/** The value one resolved opening applies: always, or when its predicate allows. */
export interface AccessOpening {
	/** The `allowWithoutRule` key that decided, for diagnostics. */
	readonly key: string
	readonly rule: true | ErasedAccessRule
}

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
	/** Configured keys that name plugin operations or permissions. */
	readonly extensionKeys: readonly string[]
	/**
	 * Resolves the opening of one method from its most precise configured
	 * key: method, operation, group, then `all` (Core's vocabulary).
	 */
	resolve(entry: CommandKeyEntry): AccessOpening | undefined
	/** Resolves the opening of one plugin permission: only its own key. */
	resolvePermission(permission: string): AccessOpening | undefined
}

/** Keys Access defines itself; any other key names a plugin command or permission. */
export const nativeOpeningKeys: ReadonlySet<string> = new Set([
	'all',
	'count',
	'create',
	'delete',
	'exists',
	'find',
	'findMany',
	'findOne',
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
		assertNoNativeWriteMethod(key, `Access allowWithoutRule.${key}`)
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

	const deciding: Readonly<Record<string, AccessOpening | false>> =
		Object.fromEntries(
			[...configured.keys()].map((key) => [key, openings.get(key) ?? false]),
		)
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
		// A configured key that opens nothing (`false`, or `'development'` in
		// production) still decides, so a precise `false` closes a broad `true`.
		resolve: (entry: CommandKeyEntry) => {
			const opening = resolveCommandKey(deciding, entry)
			return opening === false ? undefined : opening
		},
		resolvePermission: (permission: string) =>
			configured.has(permission) ? openings.get(permission) : undefined,
	})
}

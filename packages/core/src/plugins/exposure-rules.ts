import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import { nativeCommandKeys } from './command-catalog.js'
import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationDependencySelection,
	PluginSchemaMutationEffect,
	PluginSchemaMutationReturning,
} from './plugin-schema-mutations.js'
import type {
	IsSchemaRef,
	RegisteredSchema,
} from '../schema/schema/registered-schemas.js'
import type { PluginSourceSchemaMutations } from './source-schema-templates.js'

/**
 * The native keys of an exposure rule (ADR-0347), from the broadest to the
 * most precise: `all`, a group (`read`, `write`), an operation, a method.
 * The most precise key present decides each method.
 */
export interface NativeExposureRules {
	/** Every method and every request plugin command of the schema. */
	readonly all?: boolean
	/** `find`, `count` and `exists`. */
	readonly read?: boolean
	/** Every native write and every request plugin command. */
	readonly write?: boolean
	/** `findMany` and `findOne`. */
	readonly find?: boolean
	/** The `count` method. @default false */
	readonly count?: boolean
	/** The `exists` method. @default true */
	readonly exists?: boolean
	/** `createOne` and `createMany`. */
	readonly create?: boolean
	/** `updateOne` and `updateMany`. */
	readonly update?: boolean
	/** `upsertOne` and `upsertMany`. */
	readonly upsert?: boolean
	/** `deleteOne` and `deleteMany`. */
	readonly delete?: boolean
	/** @default true */
	readonly findMany?: boolean
	/** @default true */
	readonly findOne?: boolean
	/** @default true */
	readonly createOne?: boolean
	/** @default false */
	readonly createMany?: boolean
	/** @default true */
	readonly updateOne?: boolean
	/** @default false */
	readonly updateMany?: boolean
	/** @default false */
	readonly upsertOne?: boolean
	/** @default false */
	readonly upsertMany?: boolean
	/** @default true */
	readonly deleteOne?: boolean
	/** @default false */
	readonly deleteMany?: boolean
}

// Same reading as `SchemaRulesSource`, kept private: referencing that alias
// from the `.with` signature moves it into Core's shared declaration chunk,
// where its hover expands `RegisteredSchema<…>` (ADR-0347 slice audit).
type ExposureSchema<TSchema> =
	IsSchemaRef<TSchema> extends true
		? TSchema extends { readonly className: infer TClassName extends string }
			? [RegisteredSchema<TClassName>] extends [never]
				? TSchema
				: RegisteredSchema<TClassName>
			: TSchema
		: TSchema

type SchemaMutations<TSchema> = PluginSourceSchemaMutations<
	ExposureSchema<TSchema>
>

/** A command transports serve: request authority, one row named by `id`. */
type ExposableCommand = PluginSchemaMutationDefinition<
	string,
	string,
	unknown,
	readonly string[],
	'request',
	PluginSchemaMutationEffect,
	PluginSchemaMutationReturning,
	PluginSchemaMutationDependencySelection,
	'one'
>

/**
 * Names the plugin keys of one schema's exposure rule: the `One` method
 * and the operation of each request command with target one
 * (`softDeleteOne` and `softDelete`). Master commands and `…Many` methods
 * are never exposed (ADR-0347 amendment item 3).
 */
export type ExposureCommandKey<TSchema> = {
	readonly [
		TName in keyof SchemaMutations<TSchema>
	]: SchemaMutations<TSchema>[TName] extends ExposableCommand
		? TName extends `${infer TOperation}One`
			? TName | TOperation
			: never
		: never
}[keyof SchemaMutations<TSchema>] &
	string

/**
 * The plugin command keys of one schema's rule; none without a schema or
 * commands, so that a string is still refused as a rule.
 */
type ExposureCommandRules<TSchema> = unknown extends TSchema
	? unknown
	: [ExposureCommandKey<TSchema>] extends [never]
		? unknown
		: Partial<Readonly<Record<ExposureCommandKey<TSchema>, boolean>>>

/**
 * Which methods of one schema the installed transports publish (ADR-0347):
 * `false` none, `true` every method and request command, an object each
 * key by name.
 *
 * @example `.with({ expose: { write: false, create: true, softDelete: true } })`
 */
export type SchemaExposeRule<TSchema = unknown> =
	boolean | (NativeExposureRules & ExposureCommandRules<TSchema>)

/** Core's `expose` entry of `.with({ … })`, for one schema (ADR-0347). */
export interface SchemaExposeRules<TSchema> {
	/**
	 * Selects the methods every installed transport publishes for this
	 * schema. Each method is decided by the transport's own key (`rest`,
	 * `graphql`) at any level, then by `expose`, then by the transport's
	 * `default`, then by the built-in default; a transport exception wins
	 * even when it is less precise than the `expose` key. Within one rule
	 * the most precise key wins: method, operation, group (`read`,
	 * `write`), then `all`. Request plugin commands stay closed unless a
	 * key opens them (`true`, `all`, `write`, their operation or method);
	 * Master commands are never exposed. An operation key publishes the
	 * `One` method of a plugin command.
	 *
	 * @example `.with({ expose: { write: false, create: true } })`
	 */
	readonly expose?: SchemaExposeRule<TSchema>
}

/** An exposure rule after validation: a boolean or a frozen record of booleans. */
export type NormalizedExposureRule = boolean | Readonly<Record<string, boolean>>

const nativeKeys: ReadonlySet<string> = new Set(nativeCommandKeys)
const pluginKeyPattern = /^[a-z][A-Za-z0-9]*$/u

/** Options of {@link normalizeExposureRule}. */
export interface ExposureRuleNormalizationOptions {
	/**
	 * Accepts plugin operation and command names besides the native keys;
	 * `false` for a rule that applies to every schema, such as a transport
	 * `default`. @default true
	 */
	readonly pluginKeys?: boolean
}

/**
 * Validates the shape of one exposure rule (`expose`, or a transport's own
 * key such as `rest`): `true`, `false`, or an object whose keys are native
 * keys or plugin operation and command names, each set to a boolean. Plugin
 * keys are checked against the schema's commands when a transport compiles
 * its plan. `path` prefixes every message.
 *
 * @example `normalizeExposureRule(value, 'Todo.rest')`
 */
export const normalizeExposureRule = (
	value: unknown,
	path: string,
	options: ExposureRuleNormalizationOptions = {},
): NormalizedExposureRule => {
	if (typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const pluginKeys = options.pluginKeys !== false
	const entries: [string, boolean][] = []
	for (const key of Reflect.ownKeys(value)) {
		if (
			typeof key !== 'string' ||
			key === '__proto__' ||
			(!nativeKeys.has(key) && !(pluginKeys && pluginKeyPattern.test(key)))
		) {
			throw new TypeError(
				`${path} contains unknown method: ${String(key)}; use ${nativeCommandKeys.join(', ')}${pluginKeys ? ' or a plugin operation or command name' : ''}`,
			)
		}
		const entry: unknown = Reflect.get(value, key)
		if (typeof entry !== 'boolean') {
			throw new TypeError(`${path}.${key} must be a boolean`)
		}
		entries.push([key, entry])
	}
	// Keys are user-controlled: copied as entries, never assigned.
	return immutableRecord(Object.fromEntries(entries))
}

/** @internal The compiled definition key holding a schema's `expose` rule. */
export const exposeRuleKey = 'expose'

/**
 * @internal Reads the `expose` rule of a compiled schema, or `undefined`
 * when its `.with` sets none. Only Core writes the key (ADR-0347).
 */
export const readSchemaExposeRule = (
	schema: SchemaDefinition,
): NormalizedExposureRule | undefined => {
	const { definition } = schema
	if (!Object.hasOwn(definition, exposeRuleKey)) return undefined
	const stored: unknown = Reflect.get(definition, exposeRuleKey)
	return stored === undefined
		? undefined
		: normalizeExposureRule(stored, `${schema.className}.expose`)
}

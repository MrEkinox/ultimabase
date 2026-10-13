import type { SchemaDefinition } from '@ultimabase/core'
import {
	defineSchemaOption,
	type PluginSchemaMutationDefinition,
	type PluginSchemaMutationDependencySelection,
	type PluginSchemaMutationEffect,
	type PluginSchemaMutationReturning,
	type PluginSourceSchemaMutations,
	type SchemaOptionDefinition,
	type SchemaRulesHKT,
	type SchemaRulesSource,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/**
 * Exposure of one schema's methods over REST, keyed by the schema method
 * names (ADR-0324). An omitted method inherits `restPlugin({ default })`,
 * then its built-in default.
 */
export interface RestMethodRules {
	/** `GET /classes/{Schema}` and `POST /classes/{Schema}/query`. @default true */
	readonly findMany?: boolean
	/** `GET /classes/{Schema}/{id}` and `GET|POST /classes/{Schema}/first`. @default true */
	readonly findOne?: boolean
	/** `GET|POST /classes/{Schema}/count`. @default false */
	readonly count?: boolean
	/** `GET|POST /classes/{Schema}/exists`. @default true */
	readonly exists?: boolean
	/** `POST /classes/{Schema}`. @default true */
	readonly createOne?: boolean
	/** `PATCH /classes/{Schema}/{id}`. @default true */
	readonly updateOne?: boolean
	/** `DELETE /classes/{Schema}/{id}`. @default true */
	readonly deleteOne?: boolean
	/** `POST /classes/{Schema}/upsert`. @default false */
	readonly upsertOne?: boolean
	/** `POST /classes/{Schema}/bulk/create`, ordered and atomic. @default false */
	readonly createMany?: boolean
	/** `POST /classes/{Schema}/bulk/update`, ordered and atomic. @default false */
	readonly updateMany?: boolean
	/** `POST /classes/{Schema}/bulk/delete`, ordered and atomic. @default false */
	readonly deleteMany?: boolean
	/** `POST /classes/{Schema}/bulk/upsert`, ordered and atomic. @default false */
	readonly upsertMany?: boolean
}

/** One native schema method REST can expose. */
export type RestMethodName = keyof RestMethodRules

type SchemaMutations<TSchema> = PluginSourceSchemaMutations<
	SchemaRulesSource<TSchema>
>

/** A command REST can expose: request authority, one row named by `id`. */
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

/** Names the plugin commands of one schema that REST can expose. */
export type RestCommandName<TSchema> = {
	readonly [
		TName in keyof SchemaMutations<TSchema>
	]: SchemaMutations<TSchema>[TName] extends ExposableCommand ? TName : never
}[keyof SchemaMutations<TSchema>] &
	string

/**
 * REST exposure of one schema (ADR-0324): `false` exposes nothing, `true`
 * every method and command, an object each method or command by name.
 * A plugin command (`softDeleteOne`) is exposed only when named.
 *
 * @example `rest: { count: true, softDeleteOne: true }`
 */
export type RestSchemaRule<TSchema = unknown> =
	boolean | (RestMethodRules & RestCommandRules<TSchema>)

/** The command keys of one schema's rule; none without a schema. */
type RestCommandRules<TSchema> = unknown extends TSchema
	? unknown
	: Partial<Readonly<Record<RestCommandName<TSchema>, boolean>>>

/** Entry of `.with({ ... })` owned by REST, for one schema (ADR-0324). */
export interface RestRules<TSchema> {
	/**
	 * Selects the REST routes of this schema by method name; omitted methods
	 * inherit `restPlugin({ default })`.
	 * @example `rest: { count: true, deleteOne: false }`
	 */
	readonly rest?: RestSchemaRule<TSchema>
}

/** Contributes `rest` to `.with({ ... })` through Core's rules slot (ADR-0324). */
export interface RestSchemaRules extends SchemaRulesHKT {
	readonly rules: RestRules<this['schema']>
}

/** Every native method key, in route order. */
export const restMethodNames: readonly RestMethodName[] = immutableArray([
	'findMany',
	'findOne',
	'count',
	'exists',
	'createOne',
	'updateOne',
	'deleteOne',
	'upsertOne',
	'createMany',
	'updateMany',
	'deleteMany',
	'upsertMany',
])
const methodKeys: ReadonlySet<string> = new Set(restMethodNames)
const commandKeyPattern = /^[a-z][A-Za-z0-9]*$/u

/** The normalized rule of one schema: a boolean, or a sparse per-key record. */
export type NormalizedRestRule = boolean | Readonly<Record<string, boolean>>

/** @internal Validates one rule (`commands`: plugin command keys allowed). */
export const normalizeRule = (
	value: unknown,
	path: string,
	commands: boolean,
): NormalizedRestRule => {
	if (typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const entries: [string, boolean][] = []
	for (const key of Reflect.ownKeys(value)) {
		const known =
			typeof key === 'string' &&
			(methodKeys.has(key) || (commands && commandKeyPattern.test(key)))
		if (!known) {
			throw new TypeError(
				`${path} contains unknown method: ${String(key)}; use ${restMethodNames.join(', ')}${commands ? ' or a plugin command name' : ''}`,
			)
		}
		const option: unknown = value[key]
		if (typeof option !== 'boolean') {
			throw new TypeError(`${path}.${key} must be a boolean`)
		}
		entries.push([key, option])
	}
	return immutableRecord(Object.fromEntries(entries))
}

/** Owns the `rest` rule; its static type comes from the `.with` rules slot. */
export const restSchemaOption: SchemaOptionDefinition<NormalizedRestRule> =
	defineSchemaOption({
		normalize: (value, path): NormalizedRestRule =>
			normalizeRule(value, path, true),
		protocolVersion: 1,
	})

const isNormalizedRule = (value: unknown): value is NormalizedRestRule =>
	typeof value === 'boolean' ||
	(isPlainRecord(value) &&
		Object.values(value).every((item) => typeof item === 'boolean'))

/** Reads the normalized rule without treating omission as a denial. */
export const readRestSchemaRule = (
	schema: SchemaDefinition,
): NormalizedRestRule | undefined => {
	if (!Object.hasOwn(schema.definition, 'rest')) return undefined
	const rule: unknown = Reflect.get(schema.definition, 'rest')
	return isNormalizedRule(rule) ? rule : undefined
}

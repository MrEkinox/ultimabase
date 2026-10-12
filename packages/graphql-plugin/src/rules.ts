import type {
	SchemaDefinition,
	UltimaBaseGeneratedSchemaSurfaces,
} from '@ultimabase/core'
import {
	defineSchemaOption,
	type PluginSchemaMutationDefinition,
	type PluginSchemaMutationDependencySelection,
	type PluginSchemaMutationEffect,
	type PluginSchemaMutationReturning,
	type PluginSourceSchemaMutations,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
	type SchemaRulesHKT,
	type SchemaRulesSource,
} from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/**
 * Exposure of one schema's methods over GraphQL, keyed by the schema method
 * names (ADR-0325), as REST and Access rules. An omitted method inherits
 * `graphqlPlugin({ default })`, then its built-in default.
 */
export interface GraphqlMethodRules {
	/** `findMany<Type>`, a Relay connection. @default true */
	readonly findMany?: boolean
	/** `get<Type>(id)` and `findOne<Type>(where, orderBy)`. @default true */
	readonly findOne?: boolean
	/** `count<Type>(where)` and the connections' `totalCount`. @default false */
	readonly count?: boolean
	/** `exists<Type>(where)`. @default true */
	readonly exists?: boolean
	/** `create<Type>`, with nested writes. @default true */
	readonly createOne?: boolean
	/** `update<Type>`, with nested writes. @default true */
	readonly updateOne?: boolean
	/** `delete<Type>`. @default true */
	readonly deleteOne?: boolean
	/** `upsert<Type>`. @default false */
	readonly upsertOne?: boolean
	/** `createMany<Type>`, ordered and atomic. @default false */
	readonly createMany?: boolean
	/** `updateMany<Type>`, ordered and atomic. @default false */
	readonly updateMany?: boolean
	/** `deleteMany<Type>`, ordered and atomic. @default false */
	readonly deleteMany?: boolean
	/** `upsertMany<Type>`, ordered and atomic. @default false */
	readonly upsertMany?: boolean
}

/** One native schema method GraphQL can expose. */
export type GraphqlMethodName = keyof GraphqlMethodRules

/** Renames the generated GraphQL type without changing the schema name. */
export interface GraphqlTypeNameRule {
	/**
	 * Exact GraphQL object name; every generated type and root field of the
	 * schema derives from it. @default the schema className
	 * @example `typeName: 'Task'`
	 */
	readonly typeName?: string
}

type GeneratedMutations<TSchema> =
	TSchema extends Readonly<{
		className: infer TClassName extends keyof UltimaBaseGeneratedSchemaSurfaces
	}>
		? UltimaBaseGeneratedSchemaSurfaces[TClassName] extends Readonly<{
				readonly schemaMutations: infer TMutations
			}>
			? TMutations
			: Readonly<Record<never, never>>
		: Readonly<Record<never, never>>

type SchemaMutations<TSchema> = GeneratedMutations<TSchema> &
	PluginSourceSchemaMutations<SchemaRulesSource<TSchema>>

/** A command GraphQL can expose: request authority, one row named by `id`. */
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

/** Names the plugin commands of one schema that GraphQL can expose. */
export type GraphqlCommandName<TSchema> = {
	readonly [
		TName in keyof SchemaMutations<TSchema>
	]: SchemaMutations<TSchema>[TName] extends ExposableCommand ? TName : never
}[keyof SchemaMutations<TSchema>] &
	string

/** The command keys of one schema's rule; none without a schema. */
type GraphqlCommandRules<TSchema> = unknown extends TSchema
	? unknown
	: Partial<Readonly<Record<GraphqlCommandName<TSchema>, boolean>>>

/**
 * GraphQL exposure of one schema (ADR-0325): `false` exposes nothing,
 * `true` every method and command, an object each method or command by
 * name, plus an optional `typeName`. A plugin command (`softDeleteOne`) is
 * exposed only when named, or when the rule or the plugin default is `true`.
 *
 * @example `graphql: { count: true, typeName: 'Task', softDeleteOne: true }`
 */
export type GraphqlSchemaRule<TSchema = unknown> =
	| boolean
	| (GraphqlMethodRules & GraphqlTypeNameRule & GraphqlCommandRules<TSchema>)

/** Entry of `.with({ ... })` owned by GraphQL, for one schema (ADR-0325). */
export interface GraphqlRules<TSchema> {
	/**
	 * Selects the GraphQL fields of this schema by method name; omitted
	 * methods inherit `graphqlPlugin({ default })`.
	 * @example `graphql: { count: true, typeName: 'Task' }`
	 */
	readonly graphql?: GraphqlSchemaRule<TSchema>
}

/** Contributes `graphql` to `.with({ ... })` through Core's rules slot. */
export interface GraphqlSchemaRules extends SchemaRulesHKT {
	readonly rules: GraphqlRules<this['schema']>
}

/** Every native method key, in root-field order. */
export const graphqlMethodNames: readonly GraphqlMethodName[] = immutableArray([
	'findOne',
	'findMany',
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
const methodKeys: ReadonlySet<string> = new Set(graphqlMethodNames)
const commandKeyPattern = /^[a-z][A-Za-z0-9]*$/u

/** The normalized rule of one schema: a boolean, or a sparse per-key record. */
export type NormalizedGraphqlRule =
	| boolean
	| Readonly<{
			readonly methods: Readonly<Record<string, boolean>>
			readonly typeName?: string
	  }>

/** Built-in defaults used when neither the schema rule nor the plugin decides. */
const builtInDefaults: Readonly<Record<GraphqlMethodName, boolean>> =
	immutableRecord({
		count: false,
		createMany: false,
		createOne: true,
		deleteMany: false,
		deleteOne: true,
		exists: true,
		findMany: true,
		findOne: true,
		updateMany: false,
		updateOne: true,
		upsertMany: false,
		upsertOne: false,
	})

const readTypeName = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value === '') {
		throw new TypeError(`${path}.typeName must be a non-empty string`)
	}
	return value
}

/**
 * @internal Validates one rule; `schema` allows plugin command keys and
 * `typeName`, which the plugin-wide default cannot carry.
 */
export const normalizeGraphqlRule = (
	value: unknown,
	path: string,
	schema: boolean,
): NormalizedGraphqlRule => {
	if (typeof value === 'boolean') return value
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a boolean or plain object`)
	}
	const methods: [string, boolean][] = []
	let typeName: string | undefined
	for (const key of Reflect.ownKeys(value)) {
		if (schema && key === 'typeName') {
			typeName = readTypeName(value.typeName, path)
			continue
		}
		const known =
			typeof key === 'string' &&
			(methodKeys.has(key) || (schema && commandKeyPattern.test(key)))
		if (!known) {
			throw new TypeError(
				`${path} contains unknown method: ${String(key)}; use ${graphqlMethodNames.join(', ')}${schema ? ', typeName or a plugin command name' : ''}`,
			)
		}
		const option: unknown = value[key]
		if (typeof option !== 'boolean') {
			throw new TypeError(`${path}.${key} must be a boolean`)
		}
		methods.push([key, option])
	}
	return immutableRecord({
		methods: immutableRecord(Object.fromEntries(methods)),
		...(typeName === undefined ? {} : { typeName }),
	})
}

/**
 * Owns the schema `graphql` namespace. Its static type comes from the
 * `.with` rules slot (`never` keeps it out of the projection templates);
 * Typegen still types the old-form `define({ graphql })` until that form is
 * removed.
 */
export const graphqlSchemaOption: SchemaOptionDefinition<
	NormalizedGraphqlRule,
	SchemaOptionRuntimeRequirement,
	never
> = defineSchemaOption({
	normalize: (value, path): NormalizedGraphqlRule =>
		normalizeGraphqlRule(value, path, true),
	protocolVersion: 1,
	typegen: {
		module: '@ultimabase/graphql-plugin',
		type: 'GraphqlSchemaRule',
	},
})

const isNormalizedRule = (value: unknown): value is NormalizedGraphqlRule =>
	typeof value === 'boolean' ||
	(isPlainRecord(value) && isPlainRecord(value.methods))

/** Reads the normalized rule without treating omission as a denial. */
export const readGraphqlSchemaRule = (
	schema: SchemaDefinition,
): NormalizedGraphqlRule | undefined => {
	if (!Object.hasOwn(schema.definition, 'graphql')) return undefined
	const rule: unknown = Reflect.get(schema.definition, 'graphql')
	return isNormalizedRule(rule) ? rule : undefined
}

const readRule = (
	rule: NormalizedGraphqlRule | undefined,
	key: string,
): boolean | undefined => (typeof rule === 'object' ? rule.methods[key] : rule)

const isMethodName = (key: string): key is GraphqlMethodName =>
	Object.hasOwn(builtInDefaults, key)

/**
 * Resolves one method or command: schema rule, then plugin default, then
 * built-in. A plugin command is exposed only when a rule names it, or when
 * a rule or the default is `true` (ADR-0325).
 */
export const isGraphqlMethodEnabled = (
	schema: NormalizedGraphqlRule | undefined,
	defaults: NormalizedGraphqlRule | undefined,
	key: string,
): boolean => {
	const explicit = readRule(schema, key) ?? readRule(defaults, key)
	if (explicit !== undefined) return explicit
	return isMethodName(key) ? builtInDefaults[key] : false
}

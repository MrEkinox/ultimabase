import type { SchemaDefinition } from '@ultimabase/core'
import {
	defineSchemaOption,
	normalizeExposureRule,
	type ExposureCommandKey,
	type NativeExposureRules,
	type SchemaOptionDefinition,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/**
 * Exposure of one schema's methods over GraphQL (ADR-0325, ADR-0347), with
 * the keys of `.with({ expose })`: `all`, a group, an operation or a method.
 * The most precise key present decides each method; a method the rule leaves
 * out follows `expose`, then `graphqlPlugin({ default })`, then its built-in
 * default.
 */
export interface GraphqlMethodRules extends NativeExposureRules {
	/** Every root field of the schema, and every request plugin command. */
	readonly all?: boolean
	/** The `find`, `count` and `exists` query fields. */
	readonly read?: boolean
	/** Every generated mutation, and every request plugin command. */
	readonly write?: boolean
	/** `findMany<Type>`, `get<Type>(id)` and `findOne<Type>`. */
	readonly find?: boolean
	/** `create<Type>` and `createMany<Type>`. */
	readonly create?: boolean
	/** `update<Type>` and `updateMany<Type>`. */
	readonly update?: boolean
	/** `upsert<Type>` and `upsertMany<Type>`. */
	readonly upsert?: boolean
	/** `delete<Type>` and `deleteMany<Type>`. */
	readonly delete?: boolean
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
export type GraphqlMethodName =
	| 'findMany'
	| 'findOne'
	| 'count'
	| 'exists'
	| 'createOne'
	| 'updateOne'
	| 'deleteOne'
	| 'upsertOne'
	| 'createMany'
	| 'updateMany'
	| 'deleteMany'
	| 'upsertMany'

/** Renames the generated GraphQL type without changing the schema name. */
export interface GraphqlTypeNameRule {
	/**
	 * Exact GraphQL object name; every generated type and root field of the
	 * schema derives from it. @default the schema className
	 * @example `typeName: 'Task'`
	 */
	readonly typeName?: string
}

/**
 * Names the plugin keys GraphQL accepts for one schema: the `One` method
 * and the operation of each request command on one row (`archiveOne`,
 * `archive`).
 */
export type GraphqlCommandName<TSchema> = ExposureCommandKey<TSchema>

/** The command keys of one schema's rule; none without a schema. */
type GraphqlCommandRules<TSchema> = unknown extends TSchema
	? unknown
	: Partial<Readonly<Record<GraphqlCommandName<TSchema>, boolean>>>

/**
 * GraphQL exposure of one schema (ADR-0325, ADR-0347): `false` exposes
 * nothing, `true` every method and request command, an object each key by
 * name, plus an optional `typeName`. A plugin command (`softDeleteOne`) is
 * exposed only when a key opens it.
 *
 * @example `.with({ graphql: { count: true, typeName: 'Task', softDeleteOne: true } })`
 */
export type GraphqlSchemaRule<TSchema = unknown> =
	| boolean
	| (GraphqlMethodRules & GraphqlTypeNameRule & GraphqlCommandRules<TSchema>)

/** Entry of `.with({ … })` owned by GraphQL, for one schema (ADR-0325). */
export interface GraphqlRules<TSchema> {
	/**
	 * Exceptions to `.with({ expose })` for GraphQL: each key wins over
	 * `expose` at any level, even when it is less precise. Methods it leaves
	 * out follow `expose`, then `graphqlPlugin({ default })`, then the
	 * built-in defaults.
	 * @example `.with({ graphql: { count: true, typeName: 'Task' } })`
	 */
	readonly graphql?: GraphqlSchemaRule<TSchema>
}

/** Contributes `graphql` to `.with({ … })` through Core's rules slot. */
export interface GraphqlSchemaRules extends SchemaRulesHKT {
	readonly rules: GraphqlRules<this['schema']>
}

/**
 * The stored rule of one schema: a boolean, or a frozen record of exposure
 * keys plus an optional `typeName`. Core's planner reads its boolean keys
 * (ADR-0347); GraphQL reads `typeName` only.
 */
export type NormalizedGraphqlRule =
	boolean | Readonly<Record<string, boolean | string>>

const readTypeName = (value: unknown, path: string): string => {
	if (typeof value !== 'string' || value === '') {
		throw new TypeError(`${path}.typeName must be a non-empty string`)
	}
	return value
}

/**
 * @internal Validates one schema rule: `typeName`, then the exposure keys
 * with Core's vocabulary check.
 */
export const normalizeGraphqlRule = (
	value: unknown,
	path: string,
): NormalizedGraphqlRule => {
	if (!isPlainRecord(value) || !Object.hasOwn(value, 'typeName')) {
		return normalizeExposureRule(value, path)
	}
	const typeName = readTypeName(value.typeName, path)
	const keys = Object.fromEntries(
		Reflect.ownKeys(value)
			.filter((key) => key !== 'typeName')
			.map((key) => [key, Reflect.get(value, key)]),
	)
	const rule = normalizeExposureRule(keys, path)
	return immutableRecord({
		...(typeof rule === 'object' ? rule : {}),
		typeName,
	})
}

/** Owns the `graphql` rule; its static type comes from the `.with` rules slot. */
export const graphqlSchemaOption: SchemaOptionDefinition<NormalizedGraphqlRule> =
	defineSchemaOption({
		normalize: (value, path): NormalizedGraphqlRule =>
			normalizeGraphqlRule(value, path),
		protocolVersion: 1,
	})

/** Reads the GraphQL type name of one schema: its `typeName`, else its class name. */
export const readGraphqlTypeName = (schema: SchemaDefinition): string => {
	const rule: unknown = Object.hasOwn(schema.definition, 'graphql')
		? Reflect.get(schema.definition, 'graphql')
		: undefined
	return isPlainRecord(rule) && typeof rule.typeName === 'string'
		? rule.typeName
		: schema.className
}

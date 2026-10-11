import type {
	BaseSchemaTypeInfo,
	SchemaInputsTypeInfo,
	SchemaTypeInfo,
	SchemaTypeInfoByName,
	SchemaItemType,
	SchemaTypeInfoCarrier,
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../type-info.js'
import type { SchemaClass, SchemaDefinition } from './definition.js'
import type { SchemaResult } from './model-contracts.js'
import type {
	NestedUpdateDataFields,
	RequireOneField,
} from '../../query/updates/contracts.js'

/* eslint-disable @typescript-eslint/no-empty-object-type -- Declaration-merging target. */
/**
 * Application registry, declared once per application for name-keyed editor
 * types (ADR-0297). Required: constructing an application without it is a
 * type error, since rule checking would otherwise grow quadratically.
 *
 * @example
 * ```ts
 * declare module '@ultimabase/core' {
 *   interface Register {
 *     readonly app: typeof ultimabase
 *   }
 * }
 * ```
 */
export interface Register {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

// The registry is read only from lazy positions (rules, filters, queries,
// utilities), never while a schema constant is typed: a declaration reading it
// would make every schema depend on the application (TS7022). Every alias on
// the way is generic in the class name it serves: TypeScript eagerly evaluates
// non-generic aliases as soon as a declaration referencing them is resolved
// (for example while measuring variances), which would read the registry.
// Only a literal class name reads the registry: constraint computations (for
// example variance measurement) substitute `string` and must stop here.
type RegisteredApplication<TKey> = string extends TKey
	? never
	: TKey extends unknown
		? Register extends { readonly app: infer TApplication }
			? TApplication
			: never
		: never

type RegisteredSchemaUnion<TKey> =
	RegisteredApplication<TKey> extends {
		ownsSchema(schema: unknown): schema is infer TSchema
	}
		? TSchema
		: never

type ClassNameOf<TSchema> = TSchema extends {
	readonly className: infer TClassName extends string
}
	? TClassName
	: never

/** Class names of the schemas registered through `Register`. */
export type RegisteredSchemaName = ClassNameOf<RegisteredSchemaUnion<'~any'>>

/** Looks up one registered schema by its class name. */
export type RegisteredSchema<TClassName extends string> = Extract<
	RegisteredSchemaUnion<TClassName>,
	SchemaDefinition<TClassName>
>

/** Reports whether one schema type is registered under its class name. */
export type IsRegisteredSchema<TSchema> = [ClassNameOf<TSchema>] extends [never]
	? false
	: [RegisteredSchema<ClassNameOf<TSchema>>] extends [never]
		? false
		: true

/** Reads the source contract of one registered schema without re-entering the registry. */
type SourceContract<TClassName extends string> = [
	RegisteredSchema<TClassName>,
] extends [never]
	? BaseSchemaTypeInfo<TClassName>
	: RegisteredSchema<TClassName> extends SchemaTypeInfoCarrier<
				infer TContract extends SchemaTypeInfo
		  >
		? TContract
		: BaseSchemaTypeInfo<TClassName>

type SourceInputs<TClassName extends string> =
	SourceContract<TClassName>['inputs']

// Each public utility below accepts a class name or a schema type. The mapped
// type is the alias body itself (not a conditional branch, which would lose the
// alias name), so a type Core builds from a registered name prints as
// `CreateInput<"Todo">`; `CreateInput<typeof Todo>` written by a developer
// prints its argument as written.

type NameOrSchemaContract<TSchema> = TSchema extends string
	? SourceContract<TSchema>
	: IsRegisteredSchema<TSchema> extends true
		? SourceContract<ClassNameOf<TSchema>>
		: SchemaTypeInfoFor<Extract<TSchema, SchemaTypeInfoSource>>

type NameOrSchemaInputs<TSchema> = NameOrSchemaContract<TSchema>['inputs']

type NameOrSchemaResult<TSchema> = TSchema extends string
	? SchemaResult<RegisteredSchema<TSchema>>
	: IsRegisteredSchema<TSchema> extends true
		? SchemaResult<RegisteredSchema<ClassNameOf<TSchema>>>
		: SchemaResult<Extract<TSchema, SchemaDefinition>>

/**
 * Persisted values of one schema, as hooks and Access item rules see them.
 * @example `const item: Item<'Todo'> = …`
 */
export type Item<TSchema> = {
	readonly [
		TKey in keyof NameOrSchemaContract<TSchema>['item']
	]: NameOrSchemaContract<TSchema>['item'][TKey]
}

// The printed form of `CreateInput`: an alias prints its arguments as written,
// so the exported type below applies it to the class name of a registered
// schema and editors show `CreateInput<"Todo">` for `CreateInput<typeof Todo>`.
type CreateInput<TSchema> = {
	readonly [
		TKey in keyof NameOrSchemaInputs<TSchema>['nestedCreate']
	]: NameOrSchemaInputs<TSchema>['nestedCreate'][TKey]
}

/**
 * Create data of one schema: exactly the `data` of `createOne`, nested link
 * and create commands included (ADR-0310).
 * @example `const data: CreateInput<'Todo'> = { title: 'Write the slice' }`
 */
type CreateInputOf<TSchema> =
	IsRegisteredSchema<TSchema> extends true
		? CreateInput<ClassNameOf<TSchema>>
		: CreateInput<TSchema>

export type { CreateInputOf as CreateInput }

/**
 * Update data of one schema: exactly the `data` of `updateOne`, with nested
 * link commands, `{ increment }` / `{ decrement }` and at least one field
 * (ADR-0310).
 * @example `const patch: UpdateInput<'Todo'> = { archived: true }`
 */
export type UpdateInput<TSchema> = RequireOneField<
	NestedUpdateDataFields<NameOrSchemaContract<TSchema>>
>

/** Flat create values of one registered schema, as bulk commands take them. */
type CreateFields<TClassName extends string> = {
	readonly [
		TKey in keyof SourceInputs<TClassName>['create']
	]: SourceInputs<TClassName>['create'][TKey]
}

/** Flat update values of one registered schema, as bulk commands take them. */
type UpdateFields<TClassName extends string> = {
	readonly [
		TKey in keyof SourceInputs<TClassName>['update']
	]: SourceInputs<TClassName>['update'][TKey]
}

/**
 * Query selection of one schema.
 * @example `const select: Select<'Todo'> = { title: true }`
 */
export type Select<TSchema> = {
	readonly [
		TKey in keyof NameOrSchemaInputs<TSchema>['select']
	]: NameOrSchemaInputs<TSchema>['select'][TKey]
}

/**
 * Filter object of one schema.
 * @example `const where: Where<'Todo'> = { archived: { eq: false } }`
 */
export type Where<TSchema> = {
	readonly [
		TKey in keyof NameOrSchemaInputs<TSchema>['where']
	]: NameOrSchemaInputs<TSchema>['where'][TKey]
}

/**
 * Complete persisted model of one schema, as full query results return it.
 * @example `const todo: Model<'Todo'> | null = await Todo.findOne({ where })`
 */
export type Model<TSchema> = {
	readonly [
		TKey in keyof NameOrSchemaResult<TSchema>
	]: NameOrSchemaResult<TSchema>[TKey]
}

/** Named operation inputs of one registered schema. */
export interface RegisteredSchemaInputs<
	TClassName extends string,
> extends SchemaInputsTypeInfo {
	readonly create: CreateFields<TClassName>
	readonly dependencySelect: SourceInputs<TClassName>['dependencySelect']
	readonly include: NonNullable<SourceInputs<TClassName>['include']>
	readonly nestedCreate: SourceInputs<TClassName>['nestedCreate']
	readonly nestedUpdate: SourceInputs<TClassName>['nestedUpdate']
	readonly orderBy: SourceInputs<TClassName>['orderBy']
	readonly select: Select<TClassName>
	readonly update: UpdateFields<TClassName>
	readonly where: Where<TClassName>
}

/**
 * Contract of one registered schema, keyed only by its class name. It is
 * closed for TypeScript (no type variable inside), so contextual inference
 * through builders typed by it stops at the name instead of walking the graph.
 */
export interface RegisteredSchemaTypeInfo<
	TClassName extends string,
> extends SchemaTypeInfo {
	readonly fields: SourceContract<TClassName>['fields']
	readonly inputs: RegisteredSchemaInputs<TClassName>
	readonly item: Extract<Item<TClassName>, SchemaItemType>
	readonly key: TClassName
	readonly numericFields: SourceContract<TClassName>['numericFields']
	readonly output: SourceContract<TClassName>['output']
	readonly persistedFields: SourceContract<TClassName>['persistedFields']
	readonly relationships: NonNullable<
		SourceContract<TClassName>['relationships']
	>
	readonly selectableFields: SourceContract<TClassName>['selectableFields']
}

/**
 * Generated entry first, else the name-keyed contract. The registry is read
 * only inside the contract's members (an interface), never when a reference is
 * created, so string targets and declarations stay independent of `Register`;
 * an unregistered name reads the bootstrap contract through the same members.
 */
export type SchemaTypeInfoByNameOrRegistered<TClassName extends string> = [
	SchemaTypeInfoByName<TClassName>,
] extends [never]
	? string extends TClassName
		? // Constraints evaluated during declarations reach here with `string`.
			BaseSchemaTypeInfo<TClassName>
		: RegisteredSchemaTypeInfo<TClassName>
	: SchemaTypeInfoByName<TClassName>

/**
 * Name-keyed reference to one registered schema, given to plugin rules and
 * relationship builders: editors print `WhereBuilder<SchemaRef<"Todo">>`. An
 * interface (not an intersection) so that plugin rule slots, which intersect
 * the schema with `unknown`, keep its name.
 */
export interface SchemaRef<TClassName extends string> extends SchemaClass<
	RegisteredSchemaTypeInfo<TClassName>
> {
	/** Registered class name of the referenced schema. */
	readonly className: TClassName
}

/**
 * The schema reference given to plugin rules and relationship builders:
 * `SchemaRef<"Todo">` once the application is registered (short hovers,
 * name-keyed contracts), else the schema type itself.
 */
export type SchemaRulesTarget<TSchema> =
	IsRegisteredSchema<TSchema> extends true
		? SchemaRef<ClassNameOf<TSchema>>
		: TSchema

/** Class name of one schema type. */
export type SchemaClassNameOf<TSchema> = ClassNameOf<TSchema>

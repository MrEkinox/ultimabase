import type {
	ApplicationSchemaMutationManyMethod,
	ApplicationSchemaMutationMethod,
} from '../application/application-schema-mutations.js'
import type { PluginSchemaMutationDefinition } from '../plugins/plugin-schema-mutations.js'
import type { SchemaClass } from './schema/definition.js'
import type {
	DeferredSchemaTarget,
	ResolveSchemaTarget,
} from './schema/deferred-targets.js'

/** Invalidates generated fingerprints when Core's shared typegen ABI changes. */
export const generatedApplicationContractVersion = 21 as const

/** Minimal identity implemented by every generated persisted item. */
export interface SchemaItemType {
	readonly id: string
}

/** Safe persisted model exposed before an application registry is generated. */
export type BaseItem = Readonly<
	SchemaItemType & Readonly<Record<string, unknown>>
>

/* eslint-disable @typescript-eslint/no-empty-object-type -- These interfaces are intentionally empty declaration-merging targets. */
/**
 * Application-generated declarations merge their exact schema entries here.
 *
 * The empty Core interface keeps package builds independent from one concrete
 * application while module augmentation gives application code one compact
 * lookup table.
 */
export interface UltimaBaseGeneratedSchemas {}

/** Application-generated declarations merge configured root builder methods here. */
export interface UltimaBaseGeneratedFieldBuilderMethods {}

/** Application-generated declarations merge configured embedded builder methods here. */
export interface UltimaBaseGeneratedEmbeddedFieldBuilderMethods {}

/** Application-generated declarations merge configured virtual builder methods here. */
export interface UltimaBaseGeneratedVirtualFieldBuilderMethods {}

/** Application-generated declarations merge configured output builder methods here. */
export interface UltimaBaseGeneratedOutputBuilderMethods {}

/** Application-generated declarations merge accepted plugin field options here. */
export interface UltimaBaseGeneratedFieldOptions {}

/** Application-generated declarations merge accepted embedded field options here. */
export interface UltimaBaseGeneratedEmbeddedFieldOptions {}

/** Application-generated declarations merge accepted virtual field options here. */
export interface UltimaBaseGeneratedVirtualFieldOptions {}

/** Application-generated declarations merge accepted output descriptor options here. */
export interface UltimaBaseGeneratedOutputOptions {}

declare const generatedFieldOptionCompatibilityType: unique symbol

/** Application-generated declarations merge plugin-owned exact option checks here. */
export interface UltimaBaseGeneratedFieldOptionCompatibility<
	TOptions extends object,
	TValue,
> {
	readonly [generatedFieldOptionCompatibilityType]?: Readonly<{
		readonly options: TOptions
		readonly value: TValue
	}>
}

/** Application-generated declarations merge accepted plugin schema options here. */
export interface UltimaBaseGeneratedSchemaOptions {}

/** Application-generated declarations merge exact custom operations here. */
export interface UltimaBaseGeneratedOperations {}

/** Application-generated declarations merge exact application handle surfaces here. */
export interface UltimaBaseGeneratedSchemaSurfaces {}

/** Derives class methods from the canonical mutation catalog and schema visibility. */
export type UltimaBaseGeneratedSchemaClassSurface<TClassName extends string> =
	TClassName extends keyof UltimaBaseGeneratedSchemaSurfaces
		? UltimaBaseGeneratedSchemaSurfaces[TClassName] extends Readonly<{
				readonly schema: infer TMethods extends object
				readonly schemaMutations: infer TMutations extends object
			}>
			? {
					readonly [TName in keyof TMethods]: TName extends keyof TMutations
						? TMutations[TName] extends PluginSchemaMutationDefinition
							? TMutations[TName] extends Readonly<{ target: 'many' }>
								? ApplicationSchemaMutationManyMethod<
										SchemaClass<SchemaTypeInfoByNameOrBase<TClassName>>,
										TMutations[TName]
									>
								: ApplicationSchemaMutationMethod<
										SchemaClass<SchemaTypeInfoByNameOrBase<TClassName>>,
										TMutations[TName]
									>
							: never
						: never
				}
			: Readonly<Record<never, never>>
		: Readonly<Record<never, never>>

/** Marks that one complete generated registry is active in the TypeScript project. */
export interface UltimaBaseGeneratedRegistryState {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/** Groups the public operation inputs generated for one schema. */
export interface SchemaInputsTypeInfo {
	readonly create: object
	readonly dependencySelect: object
	readonly include?: object
	readonly nestedCreate: object
	readonly nestedUpdate: object
	readonly orderBy: object
	readonly select: object
	readonly update: object
	readonly where: object
}

/** Describes one generated relationship without retaining a field definition. */
export interface SchemaRelationshipTypeInfo {
	readonly kind: 'pointer' | 'relation'
	readonly target: string
}

/** Structural boundary implemented by every generated application schema entry. */
export interface SchemaTypeInfo {
	readonly fields: string
	readonly inputs: SchemaInputsTypeInfo
	readonly item: SchemaItemType
	readonly key: string
	readonly numericFields: string
	readonly output: SchemaItemType
	readonly persistedFields: string
	readonly relationships?: Readonly<Record<string, SchemaRelationshipTypeInfo>>
	readonly selectableFields: string
}

declare const schemaTypeInfoType: unique symbol

/** Carries one already-resolved generated contract without another registry lookup. */
export interface SchemaTypeInfoCarrier<TContract extends SchemaTypeInfo> {
	readonly [schemaTypeInfoType]?: TContract
}

/** Supplies either one generated contract or one runtime schema identity. */
export type SchemaTypeInfoSource =
	SchemaTypeInfo | Readonly<{ readonly className: string }>

declare const schemaRelationshipSourceType: unique symbol

/** Carries a directly declared relationship target without emitting Runtime metadata. */
export interface SchemaRelationshipSourceCarrier<
	TSource extends SchemaTypeInfoSource,
> {
	readonly [schemaRelationshipSourceType]: TSource
}

/** Minimal operation inputs exposed before code generation has run. */
export interface BaseSchemaInputsTypeInfo {
	readonly create: Readonly<Record<string, unknown>>
	readonly dependencySelect: Readonly<Record<string, boolean>> &
		Readonly<{ readonly id?: true }>
	readonly include: Readonly<Record<string, unknown>>
	readonly nestedCreate: Readonly<Record<string, unknown>>
	readonly nestedUpdate: Readonly<Record<string, unknown>>
	readonly orderBy: Readonly<Record<string, 'asc' | 'desc' | null>>
	readonly select: Readonly<Record<string, boolean>> &
		Readonly<{ readonly id?: true }>
	readonly update: Readonly<Record<string, unknown>>
	readonly where: Readonly<Record<string, unknown>>
}

/** Minimal safe contract used before code generation has produced an entry. */
export interface BaseSchemaTypeInfo<
	TClassName extends string,
> extends SchemaTypeInfo {
	readonly fields: string
	readonly inputs: BaseSchemaInputsTypeInfo
	readonly item: BaseItem
	readonly key: TClassName
	readonly numericFields: string
	readonly output: BaseItem
	readonly persistedFields: string
	readonly relationships: Readonly<Record<string, SchemaRelationshipTypeInfo>>
	readonly selectableFields: string
}

/** Names the public value projections Core reads from generated type information. */
export type SchemaTypeValueKey =
	| 'Create'
	| 'Include'
	| 'Item'
	| 'OrderBy'
	| 'Output'
	| 'Select'
	| 'Update'
	| 'Where'

type SchemaTypeValueFromTypeInfo<
	TContract extends SchemaTypeInfo,
	TKey extends SchemaTypeValueKey,
> = TKey extends 'Item'
	? TContract['item']
	: TKey extends 'Output'
		? TContract['output']
		: TKey extends 'Create'
			? TContract['inputs']['create']
			: TKey extends 'Include'
				? NonNullable<TContract['inputs']['include']>
				: TKey extends 'OrderBy'
					? TContract['inputs']['orderBy']
					: TKey extends 'Select'
						? TContract['inputs']['select']
						: TKey extends 'Update'
							? TContract['inputs']['update']
							: TContract['inputs']['where']

/** Reports whether the current TypeScript project loaded a generated registry. */
export type HasUltimaBaseGeneratedRegistry =
	'application' extends keyof UltimaBaseGeneratedRegistryState ? true : false

/** Lists exact schema names supplied by the active generated application. */
export type UltimaBaseGeneratedSchemaName = Extract<
	keyof UltimaBaseGeneratedSchemas,
	string
>

/** Suggests generated schema names while keeping first-generation declarations writable. */
export type SchemaDeclarationTargetName =
	HasUltimaBaseGeneratedRegistry extends true
		? UltimaBaseGeneratedSchemaName
		: string

/** Reads one exact generated entry without widening an unknown schema name. */
export type SchemaTypeInfoByName<TClassName extends string> =
	TClassName extends UltimaBaseGeneratedSchemaName
		? UltimaBaseGeneratedSchemas[TClassName] extends SchemaTypeInfo
			? UltimaBaseGeneratedSchemas[TClassName]
			: never
		: never

/** Resolves one generated contract or the deliberate bootstrap fallback. */
export type SchemaTypeInfoByNameOrBase<TClassName extends string> = [
	SchemaTypeInfoByName<TClassName>,
] extends [never]
	? BaseSchemaTypeInfo<TClassName>
	: SchemaTypeInfoByName<TClassName>

type SchemaTypeInfoForLiteral<TClassName extends string> =
	string extends TClassName ? never : SchemaTypeInfoByName<TClassName>

/**
 * The members `SchemaTypeInfoFor` compares when it reads a contract. The write
 * inputs are left out: computing a source contract's create and update inputs
 * walks its relation graph, so comparing them made every read of a schema pay
 * for the write types of every reachable schema (Core migration step 5b).
 * Contracts are still declared against the complete `SchemaTypeInfo`.
 */
interface ReadSchemaTypeInfo {
	readonly fields: string
	readonly inputs: Readonly<{
		readonly create: unknown
		readonly dependencySelect: object
		readonly include?: object
		readonly nestedCreate: unknown
		readonly nestedUpdate: object
		readonly orderBy: object
		readonly select: object
		readonly update: unknown
		readonly where: object
	}>
	readonly item: SchemaItemType
	readonly key: string
	readonly numericFields: string
	readonly output: SchemaItemType
	readonly persistedFields: string
	readonly relationships?: Readonly<Record<string, SchemaRelationshipTypeInfo>>
	readonly selectableFields: string
}

/** Resolves an exact generated entry only for a literal registered class name. */
export type SchemaTypeInfoFor<TSource extends SchemaTypeInfoSource> =
	TSource extends ReadSchemaTypeInfo
		? TSource
		: TSource extends {
					readonly [schemaTypeInfoType]?: infer TContract extends
						ReadSchemaTypeInfo
			  }
			? TContract
			: TSource extends DeferredSchemaTarget<unknown>
				? SchemaTypeInfoForDeferred<ResolveSchemaTarget<TSource>>
				: TSource extends {
							readonly className: infer TClassName extends string
					  }
					? [SchemaTypeInfoForLiteral<TClassName>] extends [never]
						? BaseSchemaTypeInfo<TClassName>
						: SchemaTypeInfoForLiteral<TClassName>
					: never

// A deferred target is read only from lazy positions, after its schema is typed.
// Reading the carrier directly avoids re-entering SchemaTypeInfoFor (unbounded for `any`).
type SchemaTypeInfoForDeferred<TTarget> = TTarget extends {
	readonly [schemaTypeInfoType]?: infer TContract extends ReadSchemaTypeInfo
}
	? TContract
	: BaseSchemaTypeInfo<string>

/** Reads an exact generated relationship target without inspecting local callbacks. */
export type SchemaRelationshipTargetName<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends string,
> =
	SchemaTypeInfoFor<TSchema> extends {
		readonly relationships: infer TRelationships extends Readonly<
			Record<string, SchemaRelationshipTypeInfo>
		>
	}
		? TFieldName extends keyof TRelationships
			? Extract<TRelationships[TFieldName]['target'], string>
			: never
		: never

/** Reads a direct callback target when source authoring can retain its exact class. */
export type SchemaRelationshipSource<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends string,
> =
	SchemaTypeInfoFor<TSchema> extends {
		readonly relationships: infer TRelationships extends Readonly<
			Record<string, SchemaRelationshipTypeInfo>
		>
	}
		? TFieldName extends keyof TRelationships
			? TRelationships[TFieldName] extends SchemaRelationshipSourceCarrier<
					infer TSource
				>
				? ResolveSchemaTarget<TSource>
				: never
			: never
		: never

/** Reads generated scalar numeric fields that accept atomic deltas. */
export type SchemaNumericFieldName<TSchema extends SchemaTypeInfoSource> =
	Extract<SchemaTypeInfoFor<TSchema>['numericFields'], string>

/** Selects generated relationship fields by their logical cardinality. */
export type SchemaRelationshipFieldName<
	TSchema extends SchemaTypeInfoSource,
	TKind extends SchemaRelationshipTypeInfo['kind'],
> =
	SchemaTypeInfoFor<TSchema> extends {
		readonly relationships: infer TRelationships extends Readonly<
			Record<string, SchemaRelationshipTypeInfo>
		>
	}
		? string extends keyof TRelationships
			? string
			: {
					[
						TFieldName in keyof TRelationships
					]: TRelationships[TFieldName]['kind'] extends TKind
						? TFieldName
						: never
				}[keyof TRelationships] &
					string
		: never

/** Reads one public value from a schema's generated or base type information. */
export type SchemaTypeValue<
	TSchema extends SchemaTypeInfoSource,
	TKey extends SchemaTypeValueKey,
> = SchemaTypeValueFromTypeInfo<SchemaTypeInfoFor<TSchema>, TKey>

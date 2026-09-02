/** Invalidates generated fingerprints when Core's shared typegen ABI changes. */
export const generatedApplicationContractVersion = 13 as const

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

/** Application-generated declarations merge accepted plugin field options here. */
export interface UltimaBaseGeneratedFieldOptions {}

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

/** Marks that one complete generated registry is active in the TypeScript project. */
export interface UltimaBaseGeneratedRegistryState {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

type GeneratedOperationValue<TContract> =
	TContract extends Readonly<{
		readonly snapshot: (value: unknown, path: string) => infer TValue
	}>
		? TValue
		: unknown

type GeneratedOperationMethod<TOperation> =
	TOperation extends Readonly<{
		readonly input: infer TInput
		readonly result: infer TResult
	}>
		? (
				input: GeneratedOperationValue<TInput>,
			) => Promise<GeneratedOperationValue<TResult>>
		: (input: unknown) => Promise<unknown>

type GeneratedOperationForName<TName extends string> =
	TName extends keyof UltimaBaseGeneratedOperations
		? UltimaBaseGeneratedOperations[TName]
		: unknown

type GeneratedSchemaSurfaceName<TSchema extends SchemaTypeInfoSource> =
	TSchema extends Readonly<{
		readonly className: infer TClassName extends string
	}>
		? TClassName
		: TSchema extends SchemaTypeInfo
			? TSchema['key']
			: never

type GeneratedSchemaSurfaceFor<TSchema extends SchemaTypeInfoSource> = [
	GeneratedSchemaSurfaceName<TSchema>,
] extends [never]
	? never
	: GeneratedSchemaSurfaceName<TSchema> extends keyof UltimaBaseGeneratedSchemaSurfaces
		? UltimaBaseGeneratedSchemaSurfaces[GeneratedSchemaSurfaceName<TSchema>]
		: never

type GeneratedModelCommandMethods<TSchema extends SchemaTypeInfoSource> = [
	GeneratedSchemaSurfaceFor<TSchema>,
] extends [never]
	? Readonly<Record<never, never>>
	: GeneratedSchemaSurfaceFor<TSchema> extends Readonly<{
				readonly modelCommands: infer TCommands extends Readonly<
					Record<string, string>
				>
		  }>
		? {
				readonly [TName in keyof TCommands]: GeneratedOperationMethod<
					GeneratedOperationForName<TCommands[TName]>
				>
			}
		: Readonly<Record<never, never>>

type GeneratedModelAugmentation<TSchema extends SchemaTypeInfoSource> = [
	GeneratedSchemaSurfaceFor<TSchema>,
] extends [never]
	? Readonly<Record<never, never>>
	: GeneratedSchemaSurfaceFor<TSchema> extends Readonly<{
				readonly model: infer TModel extends object
		  }>
		? TModel
		: Readonly<Record<never, never>>

/** Adds callable application-local plugin commands to Runtime model results. */
export type UltimaBaseGeneratedModelSurface<
	TSchema extends SchemaTypeInfoSource,
> = GeneratedModelAugmentation<TSchema> & GeneratedModelCommandMethods<TSchema>

/** Groups the public operation inputs generated for one schema. */
export interface SchemaInputsTypeInfo {
	readonly create: object
	readonly include?: object
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
	readonly relationships?: Readonly<Record<string, SchemaRelationshipTypeInfo>>
}

declare const schemaTypeInfoType: unique symbol

/** Carries one already-resolved generated contract without another registry lookup. */
export interface SchemaTypeInfoCarrier<TContract extends SchemaTypeInfo> {
	readonly [schemaTypeInfoType]?: TContract
}

/** Supplies either one generated contract or one runtime schema identity. */
export type SchemaTypeInfoSource =
	SchemaTypeInfo | Readonly<{ readonly className: string }>

/** Minimal operation inputs exposed before code generation has run. */
export interface BaseSchemaInputsTypeInfo {
	readonly create: Readonly<Record<string, unknown>>
	readonly include: Readonly<Record<string, unknown>>
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
	readonly relationships: Readonly<Record<string, SchemaRelationshipTypeInfo>>
}

/** Names the public value projections Core reads from generated type information. */
export type SchemaTypeValueKey =
	'Create' | 'Include' | 'Item' | 'OrderBy' | 'Select' | 'Update' | 'Where'

type SchemaTypeValueFromTypeInfo<
	TContract extends SchemaTypeInfo,
	TKey extends SchemaTypeValueKey,
> = TKey extends 'Item'
	? TContract['item']
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

/** Resolves an exact generated entry only for a literal registered class name. */
export type SchemaTypeInfoFor<TSource extends SchemaTypeInfoSource> =
	TSource extends SchemaTypeInfo
		? TSource
		: TSource extends SchemaTypeInfoCarrier<
					infer TContract extends SchemaTypeInfo
			  >
			? TContract
			: TSource extends { readonly className: infer TClassName extends string }
				? [SchemaTypeInfoForLiteral<TClassName>] extends [never]
					? BaseSchemaTypeInfo<TClassName>
					: SchemaTypeInfoForLiteral<TClassName>
				: never

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

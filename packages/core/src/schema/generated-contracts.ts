import type { FieldListOption } from './fields/base/contract.js'

/** Invalidates generated fingerprints when Core's shared typegen ABI changes. */
export const generatedApplicationContractVersion = 2 as const

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

/** Marks that one complete generated registry is active in the TypeScript project. */
export interface UltimaBaseGeneratedRegistryState {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/** Carries one field's exact generated values without executable behavior. */
export interface GeneratedFieldContract<
	TObject = unknown,
	TCreate = unknown,
	TUpdate = unknown,
	TWhere = unknown,
	TPath = unknown,
	TKind extends string = string,
	TList extends FieldListOption = FieldListOption,
> {
	readonly create: TCreate
	readonly kind: TKind
	readonly list: TList
	readonly object: TObject
	readonly paths: TPath
	readonly update: TUpdate
	readonly where: TWhere
}

/** Names one embedded object's exact generated operation shapes. */
export interface GeneratedObjectContract<TObject, TCreate, TUpdate, TPath> {
	readonly create: TCreate
	readonly object: TObject
	readonly paths: TPath
	readonly update: TUpdate
}

/** Records a generated relationship target without loading it. */
export interface GeneratedRelationshipContract<
	TTarget extends string,
	TCardinality extends 'many' | 'one',
> {
	readonly cardinality: TCardinality
	readonly target: TTarget
}

/** Supplies exact value shapes later consumed by generated schema Access typing. */
export interface GeneratedSchemaAccessContract<
	TItem,
	TCreate,
	TUpdate,
	TWhere,
	TOrderBy,
> {
	readonly create: TCreate
	readonly item: TItem
	readonly orderBy: TOrderBy
	readonly update: TUpdate
	readonly where: TWhere
}

/** Supplies exact value shapes later consumed by generated schema hook typing. */
export interface GeneratedSchemaHookContract<TItem, TCreate, TUpdate> {
	readonly create: TCreate
	readonly item: TItem
	readonly originalItem: TItem
	readonly update: TUpdate
}

/** Structural boundary implemented by every generated application schema entry. */
export interface GeneratedSchemaContract {
	readonly Access: GeneratedSchemaAccessContract<
		unknown,
		unknown,
		unknown,
		unknown,
		unknown
	>
	readonly Create: unknown
	readonly FieldBuilder: object
	readonly Fields: Readonly<Record<string, GeneratedFieldContract>>
	readonly Hooks: GeneratedSchemaHookContract<unknown, unknown, unknown>
	readonly Include: unknown
	readonly Item: unknown
	readonly Objects: Readonly<
		Record<string, GeneratedObjectContract<unknown, unknown, unknown, unknown>>
	>
	readonly OrderBy: unknown
	readonly Pointers: Readonly<
		Record<string, GeneratedRelationshipContract<string, 'one'>>
	>
	readonly Relations: Readonly<
		Record<string, GeneratedRelationshipContract<string, 'many'>>
	>
	readonly Select: unknown
	readonly Update: unknown
	readonly Where: unknown
}

/** Structural boundary implemented by one deterministic generated application. */
export interface GeneratedApplicationContract {
	readonly FieldBuilder: object
	readonly fingerprint: string
	readonly schemas: Readonly<Record<string, GeneratedSchemaContract>>
}

/** Reports whether the current TypeScript project loaded a generated registry. */
export type HasUltimaBaseGeneratedRegistry =
	'application' extends keyof UltimaBaseGeneratedRegistryState ? true : false

/** Lists exact schema names supplied by the active generated application. */
export type UltimaBaseGeneratedSchemaName = Extract<
	keyof UltimaBaseGeneratedSchemas,
	string
>

/** Reads one exact generated entry without widening an unknown schema name. */
export type GeneratedSchemaContractByName<TClassName extends string> =
	TClassName extends UltimaBaseGeneratedSchemaName
		? UltimaBaseGeneratedSchemas[TClassName] extends GeneratedSchemaContract
			? UltimaBaseGeneratedSchemas[TClassName]
			: never
		: never

type GeneratedSchemaContractForLiteral<TClassName extends string> =
	string extends TClassName ? never : GeneratedSchemaContractByName<TClassName>

/** Resolves an exact generated entry only for a literal registered class name. */
export type GeneratedSchemaContractFor<
	TSchema extends { readonly className: string },
> = GeneratedSchemaContractForLiteral<TSchema['className']>

/** Selects generated data when available and preserves Core's broad internal fallback. */
export type GeneratedSchemaValueOr<
	TSchema extends { readonly className: string },
	TKey extends keyof GeneratedSchemaContract,
	TFallback,
> = [GeneratedSchemaContractFor<TSchema>] extends [never]
	? TFallback
	: GeneratedSchemaContractFor<TSchema> extends GeneratedSchemaContract
		? GeneratedSchemaContractFor<TSchema>[TKey]
		: TFallback

/**
 * Makes a stale generated entry fail on `className` with an actionable editor
 * diagnostic while leaving the no-registry bootstrap path transpileable.
 */
export type RequireGeneratedSchemaEntry<TClassName extends string> =
	HasUltimaBaseGeneratedRegistry extends true
		? TClassName extends UltimaBaseGeneratedSchemaName
			? unknown
			: Readonly<{
					'UltimaBase generated schema is missing or stale; regenerate it with @ultimabase/codegen': never
				}>
		: unknown

/** Invalidates generated fingerprints when Core's shared typegen ABI changes. */
export const generatedApplicationContractVersion = 5 as const

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

declare const generatedSchemaItemFallbackType: unique symbol

/** Supplies the safe item shape used while a schema declaration is being authored. */
export interface GeneratedSchemaItemFallback<TItem extends object> {
	readonly [generatedSchemaItemFallbackType]?: TItem
}

/** Reads an authoring fallback without affecting ordinary inferred schema models. */
export type GeneratedSchemaItemFallbackOr<TSchema, TFallback> =
	TSchema extends GeneratedSchemaItemFallback<infer TItem> ? TItem : TFallback

/** Groups the public operation inputs generated for one schema. */
export interface GeneratedSchemaInputsContract {
	readonly create: unknown
	readonly include?: unknown
	readonly orderBy: unknown
	readonly select: unknown
	readonly update: unknown
	readonly where: unknown
}

/** Structural boundary implemented by every generated application schema entry. */
export interface GeneratedSchemaContract {
	readonly fields: string
	readonly inputs: GeneratedSchemaInputsContract
	readonly item: unknown
	readonly key: string
	readonly relationships?: Readonly<Record<string, string>>
}

/** Names the public value projections Core reads from generated type information. */
export type GeneratedSchemaValueKey =
	'Create' | 'Include' | 'Item' | 'OrderBy' | 'Select' | 'Update' | 'Where'

type GeneratedSchemaValue<
	TContract extends GeneratedSchemaContract,
	TKey extends GeneratedSchemaValueKey,
> = TKey extends 'Item'
	? TContract['item']
	: TKey extends 'Create'
		? TContract['inputs']['create']
		: TKey extends 'Include'
			? TContract['inputs'] extends { readonly include: infer TInclude }
				? TInclude
				: never
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

/** Reads an exact generated relationship target without inspecting local callbacks. */
export type GeneratedSchemaRelationshipTargetName<
	TSchema extends { readonly className: string },
	TFieldName extends string,
> =
	GeneratedSchemaContractFor<TSchema> extends infer TContract extends
		GeneratedSchemaContract
		? TContract extends {
				readonly relationships: infer TRelationships extends Readonly<
					Record<string, string>
				>
			}
			? TFieldName extends keyof TRelationships
				? Extract<TRelationships[TFieldName], string>
				: never
			: never
		: never

/** Selects generated data when available and preserves Core's broad internal fallback. */
export type GeneratedSchemaValueOr<
	TSchema extends { readonly className: string },
	TKey extends GeneratedSchemaValueKey,
	TFallback,
> = [GeneratedSchemaContractFor<TSchema>] extends [never]
	? TFallback
	: GeneratedSchemaContractFor<TSchema> extends GeneratedSchemaContract
		? GeneratedSchemaValue<GeneratedSchemaContractFor<TSchema>, TKey>
		: TFallback

/**
 * Makes a stale generated entry fail on `className` with an actionable editor
 * diagnostic while leaving the no-registry bootstrap path transpileable.
 */
export type RequireGeneratedSchemaEntry<TClassName extends string> =
	HasUltimaBaseGeneratedRegistry extends true
		? TClassName extends UltimaBaseGeneratedSchemaName
			? Readonly<Record<never, never>>
			: Readonly<{
					'UltimaBase generated schema is missing or stale; regenerate it with @ultimabase/codegen': never
				}>
		: Readonly<Record<never, never>>

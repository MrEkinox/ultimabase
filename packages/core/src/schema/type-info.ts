import type {
	DeferredSchemaTarget,
	ResolveSchemaTarget,
} from './schema/deferred-targets.js'

/** Minimal identity implemented by every persisted item. */
export interface SchemaItemType {
	readonly id: string
}

/** Safe persisted model used when a schema's fields are not known. */
export type BaseItem = Readonly<
	SchemaItemType & Readonly<Record<string, unknown>>
>

/** Groups the public operation inputs of one schema. */
export interface SchemaInputsTypeInfo {
	readonly create: object
	readonly dependencySelect: object
	readonly include?: object
	readonly nestedCreate: object
	readonly nestedUpdate: object
	readonly orderBy: object
	readonly select: object
	/** The unique targets of `updateOne`, `deleteOne` and `upsertOne`, by field list (ADR-0332). */
	readonly uniqueTargets: object
	readonly update: object
	readonly where: object
}

/** Describes one relationship without retaining a field definition. */
export interface SchemaRelationshipTypeInfo {
	readonly kind: 'pointer' | 'relation'
	readonly target: string
}

/** Structural boundary implemented by every schema type contract. */
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

/** Carries one already-resolved contract without another registry lookup. */
export interface SchemaTypeInfoCarrier<TContract extends SchemaTypeInfo> {
	readonly [schemaTypeInfoType]?: TContract
}

/** Supplies either one contract or one runtime schema identity. */
export type SchemaTypeInfoSource =
	SchemaTypeInfo | Readonly<{ readonly className: string }>

declare const schemaRelationshipSourceType: unique symbol

/** Carries a directly declared relationship target without emitting Runtime metadata. */
export interface SchemaRelationshipSourceCarrier<
	TSource extends SchemaTypeInfoSource,
> {
	readonly [schemaRelationshipSourceType]: TSource
}

/** Minimal operation inputs of a schema whose fields are not known. */
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
	readonly uniqueTargets: Readonly<
		Record<string, Readonly<Record<string, unknown>>>
	>
	readonly update: Readonly<Record<string, unknown>>
	readonly where: Readonly<Record<string, unknown>>
}

/** Minimal safe contract of a schema whose fields are not known. */
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

/** Names the public value projections Core reads from type information. */
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
		readonly uniqueTargets: object
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

/** Resolves the contract carried by a schema, or the base one for a bare name. */
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
					? BaseSchemaTypeInfo<TClassName>
					: never

// A deferred target is read only from lazy positions, after its schema is typed.
// Reading the carrier directly avoids re-entering SchemaTypeInfoFor (unbounded for `any`).
type SchemaTypeInfoForDeferred<TTarget> = TTarget extends {
	readonly [schemaTypeInfoType]?: infer TContract extends ReadSchemaTypeInfo
}
	? TContract
	: BaseSchemaTypeInfo<string>

/** Reads an exact relationship target without inspecting local callbacks. */
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

/** Reads scalar numeric fields that accept atomic deltas. */
export type SchemaNumericFieldName<TSchema extends SchemaTypeInfoSource> =
	Extract<SchemaTypeInfoFor<TSchema>['numericFields'], string>

/** Selects relationship fields by their logical cardinality. */
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

/** Reads one public value from a schema's type information. */
export type SchemaTypeValue<
	TSchema extends SchemaTypeInfoSource,
	TKey extends SchemaTypeValueKey,
> = SchemaTypeValueFromTypeInfo<SchemaTypeInfoFor<TSchema>, TKey>

// Form G' (redesigned classes with Effect-style `Self`): copy of forms/g-class/lib/types.ts
// without the name registry. Schemas are referenced by their class instance type
// (`Todo`), which carries a phantom brand with the class name and fields.
// It mirrors the public shape of packages/core (field builder callback, pointer and
// relation fields, Prisma-like where/select/include, typed results) without Runtime.
// Public types take the schema value type (`typeof Todo`) so that a class-declared
// schema prints as a short name in hovers and errors. Core never names a plugin.

// ---------------------------------------------------------------- fields

/** Field kinds whose values are stored in the row itself. */
export type ScalarKind = 'string' | 'int' | 'float' | 'boolean' | 'date' | 'enum' | 'json'

/** One stored scalar field with its exact TypeScript value. */
export interface ScalarField<TKind extends ScalarKind = ScalarKind, TValue = unknown, TRequired extends boolean = boolean> {
	readonly kind: TKind
	readonly '~value': TValue
	readonly '~required': TRequired
}

/**
 * One pointer to another schema. `TTarget` is kept unevaluated (a thunk type or a
 * schema name) so declaring the field never resolves the target schema's type.
 */
export interface PointerField<TTarget = unknown, TRequired extends boolean = boolean> {
	readonly kind: 'pointer'
	readonly '~target': TTarget
	readonly '~required': TRequired
}

/** One relation (inverse one-to-many or many-to-many) to another schema. */
export interface RelationField<TTarget = unknown, TMappedBy extends string | undefined = string | undefined> {
	readonly kind: 'relation'
	readonly '~target': TTarget
	readonly '~mappedBy': TMappedBy
}

/** Fields every schema receives from Core. */
export interface SystemFields {
	readonly id: ScalarField<'string', string, true>
	readonly createdAt: ScalarField<'date', Date, true>
	readonly updatedAt: ScalarField<'date', Date, true>
}

// ---------------------------------------------------------------- schema references

declare const schemaBrand: unique symbol

/**
 * Phantom brand of model instances (`Todo`), so that the instance type named in
 * `App.Schema<Todo>()` carries its class name and fields: callback types are then
 * written against `Todo` and print `WhereBuilder<Todo>` without any registry.
 */
export interface SchemaBrand<TName extends string, TFields> {
	readonly [schemaBrand]: { readonly className: TName; readonly fields: TFields }
}

/** Key of the brand, excluded from model member checks. */
export type SchemaBrandKey = typeof schemaBrand

type ClassNameOf<TSchema> = TSchema extends { readonly className: infer TName extends string }
	? TName
	: TSchema extends SchemaBrand<infer TName, unknown>
		? TName
		: never

/** Resolves a pointer or relation target thunk (`() => User`), kept unevaluated until read. */
export type ResolveTarget<TTarget> = TTarget extends () => infer TSchema ? TSchema : never

/** Reads the complete field map of a schema class (`typeof Todo`) or of its instance type (`Todo`). */
export type FieldsOf<TRef> = TRef extends { readonly '~fields': infer TFields }
	? TFields
	: TRef extends SchemaBrand<string, infer TFields>
		? TFields
		: never

/** Schema targeted by one relationship field. */
export type TargetOf<TField> = TField extends { readonly '~target': infer TTarget } ? ResolveTarget<TTarget> : never

/** Instance type of the schema targeted by one relationship field (`TodoUser`). */
export type TargetRef<TField> = InstanceOf<TargetOf<TField>>

// ---------------------------------------------------------------- key selectors

export type KeysWhere<TFields, TKind> = { [K in keyof TFields]: TFields[K] extends TKind ? K : never }[keyof TFields] & string

/** Scalar field names of one schema. */
export type ScalarKeys<TSchema> = KeysWhere<FieldsOf<TSchema>, ScalarField>
/** Pointer field names of one schema. */
export type PointerKeys<TSchema> = KeysWhere<FieldsOf<TSchema>, PointerField>
/** Relation field names of one schema. */
export type RelationKeys<TSchema> = KeysWhere<FieldsOf<TSchema>, RelationField>

type Nullable<TValue, TRequired> = TRequired extends true ? TValue : TValue | null

type ScalarValueOf<TField> =
	TField extends ScalarField<ScalarKind, infer TValue, infer TRequired> ? Nullable<TValue, TRequired> : never

/** Exact value of one scalar field of one schema. */
export type FieldValue<TSchema, TKey extends keyof FieldsOf<TSchema>> = ScalarValueOf<FieldsOf<TSchema>[TKey]>

// ---------------------------------------------------------------- where

export interface EqualityFilter<TValue> {
	readonly eq?: TValue
	readonly ne?: TValue
	readonly in?: readonly TValue[]
	readonly notIn?: readonly TValue[]
}
export interface OrderedFilter<TValue> extends EqualityFilter<TValue> {
	readonly gt?: TValue
	readonly gte?: TValue
	readonly lt?: TValue
	readonly lte?: TValue
}
export interface StringFilter extends OrderedFilter<string> {
	readonly contains?: string
	readonly startsWith?: string
	readonly endsWith?: string
}
export interface NullFilter {
	readonly isNull?: boolean
}

type ScalarFilter<TField> =
	TField extends ScalarField<infer TKind, infer TValue, infer TRequired>
		? (TKind extends 'string' ? StringFilter : TKind extends 'int' | 'float' | 'date' ? OrderedFilter<TValue> : EqualityFilter<TValue>) &
				(TRequired extends true ? unknown : NullFilter)
		: never

/** Filters one pointer by its target's fields. */
export interface PointerFilter<TTarget> {
	readonly is?: Where<TTarget> | null
	readonly isNot?: Where<TTarget> | null
}

/** Filters one relation by its target's fields. */
export interface RelationFilter<TTarget> {
	readonly some?: Where<TTarget>
	readonly every?: Where<TTarget>
	readonly none?: Where<TTarget>
}

type FieldFilter<TField> = TField extends ScalarField
	? ScalarFilter<TField>
	: TField extends PointerField
		? PointerFilter<TargetRef<TField>>
		: TField extends RelationField
			? RelationFilter<TargetRef<TField>>
			: never

/** Prisma-like filter object over one complete schema, including relations. */
export type Where<TSchema> = { readonly [K in keyof FieldsOf<TSchema>]?: FieldFilter<FieldsOf<TSchema>[K]> } & {
	readonly AND?: readonly Where<TSchema>[]
	readonly OR?: readonly Where<TSchema>[]
	readonly NOT?: Where<TSchema>
}

declare const whereExpression: unique symbol

/** Runtime class name of one schema class or instance type. */
export type SchemaName<TRef> = ClassNameOf<TRef>

/**
 * Opaque filter produced by a WhereBuilder, branded by the schema's class name only.
 * Branding by the complete schema type made every generic builder call in a callback
 * return position walk the whole relation graph (contextual return-type inference):
 * quadratic check time, measured in scratch/toggle2.py.
 */
export interface WhereExpression<TName extends string> {
	readonly [whereExpression]: TName
}

/**
 * Target builders of one schema's relationship fields, keyed by field name. Indexing
 * this concrete map with the method's `K` keeps the constraint of the callback types
 * to this schema's own targets; resolving the target through the registry under a
 * generic `K` made TypeScript widen to every registered schema (quadratic, section 9).
 */
type TargetBuilders<TSchema> = { readonly [K in PointerKeys<TSchema> | RelationKeys<TSchema>]: WhereBuilder<TargetRef<FieldsOf<TSchema>[K]>> }
type TargetExpressions<TSchema> = {
	readonly [K in PointerKeys<TSchema> | RelationKeys<TSchema>]: WhereExpression<SchemaName<TargetRef<FieldsOf<TSchema>[K]>>>
}

/** Immutable builder used by policy callbacks (mirrors Core's WhereBuilder). */
export interface WhereBuilder<TSchema> {
	eq<K extends ScalarKeys<TSchema>>(field: K, value: FieldValue<TSchema, K>): WhereExpression<SchemaName<TSchema>>
	ne<K extends ScalarKeys<TSchema>>(field: K, value: FieldValue<TSchema, K>): WhereExpression<SchemaName<TSchema>>
	is<K extends PointerKeys<TSchema>>(
		field: K,
		target: (where: TargetBuilders<TSchema>[K]) => NoInfer<TargetExpressions<TSchema>[K]>,
	): WhereExpression<SchemaName<TSchema>>
	some<K extends RelationKeys<TSchema>>(
		field: K,
		target: (where: TargetBuilders<TSchema>[K]) => NoInfer<TargetExpressions<TSchema>[K]>,
	): WhereExpression<SchemaName<TSchema>>
	and(...filters: readonly WhereExpression<SchemaName<TSchema>>[]): WhereExpression<SchemaName<TSchema>>
	object(filter: Where<TSchema>): WhereExpression<SchemaName<TSchema>>
}

// ---------------------------------------------------------------- select, include, results

/** Scalar and pointer fields to return. */
export type Select<TSchema> = {
	readonly [K in keyof FieldsOf<TSchema> as FieldsOf<TSchema>[K] extends RelationField ? never : K]?: boolean
}

/** Options accepted when including one pointer target. */
export interface IncludePointer<TTarget> {
	readonly select?: Select<TTarget>
	readonly include?: Include<TTarget>
}

/** Options accepted when including one relation target. */
export interface IncludeRelation<TTarget> extends IncludePointer<TTarget> {
	readonly where?: Where<TTarget>
	readonly limit?: number
	readonly orderBy?: OrderBy<TTarget>
}

/** Pointer and relation targets to load. */
export type Include<TSchema> = {
	readonly [K in keyof FieldsOf<TSchema> as FieldsOf<TSchema>[K] extends PointerField | RelationField ? K : never]?:
		| true
		| (FieldsOf<TSchema>[K] extends RelationField
				? IncludeRelation<TargetRef<FieldsOf<TSchema>[K]>>
				: IncludePointer<TargetRef<FieldsOf<TSchema>[K]>>)
}

/** Sort order over scalar fields. */
export type OrderBy<TSchema> = { readonly [K in ScalarKeys<TSchema>]?: 'asc' | 'desc' }

/** Arguments of `findMany`. */
export interface FindManyArgs<TSchema> {
	readonly where?: Where<TSchema>
	readonly select?: Select<TSchema>
	readonly include?: Include<TSchema>
	readonly orderBy?: OrderBy<TSchema>
	readonly limit?: number
	readonly offset?: number
	/** Runs with Master authority (server-side only). */
	readonly useMasterKey?: boolean
}

/** Unloaded pointer value: only the identity is known. */
export interface PointerRef {
	readonly id: string
}

type Get<TObject, TKey> = TKey extends keyof TObject ? TObject[TKey] : undefined

type SelectedKeys<TFields, TSelect> = [TSelect] extends [undefined]
	? Exclude<keyof TFields, KeysWhere<TFields, RelationField>>
	: 'id' | { [K in keyof TSelect]: TSelect[K] extends true ? K : never }[keyof TSelect]

type InclusionArgs<TInclusion> = TInclusion extends true ? Readonly<Record<never, never>> : TInclusion

type FieldOutput<TField, TInclusion> = TField extends ScalarField
	? ScalarValueOf<TField>
	: TField extends PointerField<unknown, infer TRequired>
		? [TInclusion] extends [undefined]
			? Nullable<PointerRef, TRequired>
			: Nullable<Flat<ResultFields<FieldsOf<TargetOf<TField>>, InclusionArgs<TInclusion>>>, TRequired>
		: TField extends RelationField
			? Flat<ResultFields<FieldsOf<TargetOf<TField>>, InclusionArgs<TInclusion>>>[]
			: never

type ResultFields<TFields, TArgs> = {
	readonly [K in SelectedKeys<TFields, Get<TArgs, 'select'>> | (keyof Get<TArgs, 'include'> & keyof TFields)]: K extends keyof TFields
		? FieldOutput<TFields[K], Get<Get<TArgs, 'include'>, K>>
		: never
}

type Flat<TValue> = { [K in keyof TValue]: TValue[K] } & {}

/** Exact result of one query; flattened so editors print the resolved object. */
export type Result<TSchema, TArgs> = Flat<ResultFields<FieldsOf<TSchema>, TArgs>>

// ---------------------------------------------------------------- writes

type RequiredKeys<TFields> = { [K in keyof TFields]: TFields[K] extends { readonly '~required': true } ? K : never }[keyof TFields]

type WritableKeys<TFields> = Exclude<keyof TFields, keyof SystemFields | KeysWhere<TFields, RelationField>>

type InputValue<TField> = TField extends ScalarField ? ScalarValueOf<TField> : TField extends PointerField ? { readonly connect: string } : never

type CreateFields<TFields> = {
	readonly [K in WritableKeys<TFields> & RequiredKeys<TFields>]: InputValue<TFields[K]>
} & {
	readonly [K in Exclude<WritableKeys<TFields>, RequiredKeys<TFields>>]?: InputValue<TFields[K]>
}

/** Create input: required fields are mandatory, pointers connect by id. */
export type CreateInput<TSchema> = CreateFields<FieldsOf<TSchema>>

/** Instance (model) type of one schema class: `InstanceOf<typeof Todo>` prints `Todo`. */
export type InstanceOf<TSchema> = TSchema extends abstract new (...args: never) => infer TInstance ? TInstance : never

/** Stored values of one schema (relations excluded, pointers as identities): the model instance type. */
export type ModelValues<TFields> = { readonly [K in Exclude<keyof TFields, KeysWhere<TFields, RelationField>>]: FieldOutput<TFields[K], undefined> }

/** Record seen by hooks: the model instance type (`Todo`). */
export type Item<TRef> =
	TRef extends abstract new (...args: never) => infer TInstance
		? TInstance
		: TRef extends SchemaBrand<string, unknown>
			? TRef
			: Readonly<Writable<Result<TRef, Readonly<Record<never, never>>>>>

/**
 * Same members without `readonly`; `Item` re-applies it once through `Readonly<...>`
 * so hovers print `Readonly<{ title: string; ... }>` instead of one `readonly` per line.
 */
type Writable<TValue> = { -readonly [K in keyof TValue]: TValue[K] } & {}

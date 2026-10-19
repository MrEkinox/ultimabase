/** Field kinds whose values are stored in the row itself. */
export type ScalarKind = 'string' | 'int' | 'float' | 'boolean' | 'date' | 'enum' | 'json';
/** One stored scalar field with its exact TypeScript value. */
export interface ScalarField<TKind extends ScalarKind = ScalarKind, TValue = unknown, TRequired extends boolean = boolean> {
    readonly kind: TKind;
    readonly '~value': TValue;
    readonly '~required': TRequired;
}
/**
 * One pointer to another schema. `TTarget` is kept unevaluated (a thunk type or a
 * schema name) so declaring the field never resolves the target schema's type.
 */
export interface PointerField<TTarget = unknown, TRequired extends boolean = boolean> {
    readonly kind: 'pointer';
    readonly '~target': TTarget;
    readonly '~required': TRequired;
}
/** One relation (inverse one-to-many or many-to-many) to another schema. */
export interface RelationField<TTarget = unknown, TMappedBy extends string | undefined = string | undefined> {
    readonly kind: 'relation';
    readonly '~target': TTarget;
    readonly '~mappedBy': TMappedBy;
}
/** Fields every schema receives from Core. */
export interface SystemFields {
    readonly id: ScalarField<'string', string, true>;
    readonly createdAt: ScalarField<'date', Date, true>;
    readonly updatedAt: ScalarField<'date', Date, true>;
}
/** Name registry declared once by the application (string-target variant only). */
export interface Register {
}
type RegisteredList = Register extends {
    readonly schemas: infer TList extends readonly unknown[];
} ? TList : readonly [];
/** Looks up one registered schema by its `className`, lazily. */
export type SchemaNamed<TName> = Extract<RegisteredList[number], {
    readonly className: TName;
}>;
/** Resolves a pointer or relation target: thunk (`() => User`) or registered name (`'User'`). */
export type ResolveTarget<TTarget> = TTarget extends () => infer TSchema ? TSchema : TTarget extends string ? SchemaNamed<TTarget> : never;
/** Reads the complete field map carried by one schema value. */
export type FieldsOf<TSchema> = TSchema extends {
    readonly '~fields': infer TFields;
} ? TFields : never;
/** Schema targeted by one relationship field. */
export type TargetOf<TField> = TField extends {
    readonly '~target': infer TTarget;
} ? ResolveTarget<TTarget> : never;
type KeysWhere<TFields, TKind> = {
    [K in keyof TFields]: TFields[K] extends TKind ? K : never;
}[keyof TFields] & string;
/** Scalar field names of one schema. */
export type ScalarKeys<TSchema> = KeysWhere<FieldsOf<TSchema>, ScalarField>;
/** Pointer field names of one schema. */
export type PointerKeys<TSchema> = KeysWhere<FieldsOf<TSchema>, PointerField>;
/** Relation field names of one schema. */
export type RelationKeys<TSchema> = KeysWhere<FieldsOf<TSchema>, RelationField>;
type Nullable<TValue, TRequired> = TRequired extends true ? TValue : TValue | null;
type ScalarValueOf<TField> = TField extends ScalarField<ScalarKind, infer TValue, infer TRequired> ? Nullable<TValue, TRequired> : never;
/** Exact value of one scalar field of one schema. */
export type FieldValue<TSchema, TKey extends keyof FieldsOf<TSchema>> = ScalarValueOf<FieldsOf<TSchema>[TKey]>;
export interface EqualityFilter<TValue> {
    readonly eq?: TValue;
    readonly ne?: TValue;
    readonly in?: readonly TValue[];
    readonly notIn?: readonly TValue[];
}
export interface OrderedFilter<TValue> extends EqualityFilter<TValue> {
    readonly gt?: TValue;
    readonly gte?: TValue;
    readonly lt?: TValue;
    readonly lte?: TValue;
}
export interface StringFilter extends OrderedFilter<string> {
    readonly contains?: string;
    readonly startsWith?: string;
    readonly endsWith?: string;
}
export interface NullFilter {
    readonly isNull?: boolean;
}
type ScalarFilter<TField> = TField extends ScalarField<infer TKind, infer TValue, infer TRequired> ? (TKind extends 'string' ? StringFilter : TKind extends 'int' | 'float' | 'date' ? OrderedFilter<TValue> : EqualityFilter<TValue>) & (TRequired extends true ? unknown : NullFilter) : never;
/** Filters one pointer by its target's fields. */
export interface PointerFilter<TTarget> {
    readonly is?: Where<TTarget> | null;
    readonly isNot?: Where<TTarget> | null;
}
/** Filters one relation by its target's fields. */
export interface RelationFilter<TTarget> {
    readonly some?: Where<TTarget>;
    readonly every?: Where<TTarget>;
    readonly none?: Where<TTarget>;
}
type FieldFilter<TField> = TField extends ScalarField ? ScalarFilter<TField> : TField extends PointerField ? PointerFilter<TargetOf<TField>> : TField extends RelationField ? RelationFilter<TargetOf<TField>> : never;
/** Prisma-like filter object over one complete schema, including relations. */
export type Where<TSchema> = {
    readonly [K in keyof FieldsOf<TSchema>]?: FieldFilter<FieldsOf<TSchema>[K]>;
} & {
    readonly AND?: readonly Where<TSchema>[];
    readonly OR?: readonly Where<TSchema>[];
    readonly NOT?: Where<TSchema>;
};
declare const whereExpression: unique symbol;
/** Opaque filter produced by a WhereBuilder, bound to one schema. */
export interface WhereExpression<TSchema> {
    readonly [whereExpression]: TSchema;
}
/** Immutable builder used by policy callbacks (mirrors Core's WhereBuilder). */
export interface WhereBuilder<TSchema> {
    eq<K extends ScalarKeys<TSchema>>(field: K, value: FieldValue<TSchema, K>): WhereExpression<TSchema>;
    ne<K extends ScalarKeys<TSchema>>(field: K, value: FieldValue<TSchema, K>): WhereExpression<TSchema>;
    is<K extends PointerKeys<TSchema>>(field: K, target: (where: WhereBuilder<TargetOf<FieldsOf<TSchema>[K]>>) => WhereExpression<TargetOf<FieldsOf<TSchema>[K]>>): WhereExpression<TSchema>;
    some<K extends RelationKeys<TSchema>>(field: K, target: (where: WhereBuilder<TargetOf<FieldsOf<TSchema>[K]>>) => WhereExpression<TargetOf<FieldsOf<TSchema>[K]>>): WhereExpression<TSchema>;
    and(...filters: readonly WhereExpression<TSchema>[]): WhereExpression<TSchema>;
    object(filter: Where<TSchema>): WhereExpression<TSchema>;
}
/** Scalar and pointer fields to return. */
export type Select<TSchema> = {
    readonly [K in keyof FieldsOf<TSchema> as FieldsOf<TSchema>[K] extends RelationField ? never : K]?: boolean;
};
/** Options accepted when including one pointer target. */
export interface IncludePointer<TTarget> {
    readonly select?: Select<TTarget>;
    readonly include?: Include<TTarget>;
}
/** Options accepted when including one relation target. */
export interface IncludeRelation<TTarget> extends IncludePointer<TTarget> {
    readonly where?: Where<TTarget>;
    readonly limit?: number;
    readonly orderBy?: OrderBy<TTarget>;
}
/** Pointer and relation targets to load. */
export type Include<TSchema> = {
    readonly [K in keyof FieldsOf<TSchema> as FieldsOf<TSchema>[K] extends PointerField | RelationField ? K : never]?: true | (FieldsOf<TSchema>[K] extends RelationField ? IncludeRelation<TargetOf<FieldsOf<TSchema>[K]>> : IncludePointer<TargetOf<FieldsOf<TSchema>[K]>>);
};
/** Sort order over scalar fields. */
export type OrderBy<TSchema> = {
    readonly [K in ScalarKeys<TSchema>]?: 'asc' | 'desc';
};
/** Arguments of `findMany`. */
export interface FindManyArgs<TSchema> {
    readonly where?: Where<TSchema>;
    readonly select?: Select<TSchema>;
    readonly include?: Include<TSchema>;
    readonly orderBy?: OrderBy<TSchema>;
    readonly limit?: number;
    readonly offset?: number;
}
/** Unloaded pointer value: only the identity is known. */
export interface PointerRef {
    readonly id: string;
}
type Get<TObject, TKey> = TKey extends keyof TObject ? TObject[TKey] : undefined;
type SelectedKeys<TFields, TSelect> = [TSelect] extends [undefined] ? Exclude<keyof TFields, KeysWhere<TFields, RelationField>> : 'id' | {
    [K in keyof TSelect]: TSelect[K] extends true ? K : never;
}[keyof TSelect];
type InclusionArgs<TInclusion> = TInclusion extends true ? Readonly<Record<never, never>> : TInclusion;
type FieldOutput<TField, TInclusion> = TField extends ScalarField ? ScalarValueOf<TField> : TField extends PointerField<unknown, infer TRequired> ? [TInclusion] extends [undefined] ? Nullable<PointerRef, TRequired> : Nullable<Flat<ResultFields<FieldsOf<TargetOf<TField>>, InclusionArgs<TInclusion>>>, TRequired> : TField extends RelationField ? Flat<ResultFields<FieldsOf<TargetOf<TField>>, InclusionArgs<TInclusion>>>[] : never;
type ResultFields<TFields, TArgs> = {
    readonly [K in SelectedKeys<TFields, Get<TArgs, 'select'>> | (keyof Get<TArgs, 'include'> & keyof TFields)]: K extends keyof TFields ? FieldOutput<TFields[K], Get<Get<TArgs, 'include'>, K>> : never;
};
type Flat<TValue> = {
    [K in keyof TValue]: TValue[K];
} & {};
/** Exact result of one query; flattened so editors print the resolved object. */
export type Result<TSchema, TArgs> = Flat<ResultFields<FieldsOf<TSchema>, TArgs>>;
type RequiredKeys<TFields> = {
    [K in keyof TFields]: TFields[K] extends {
        readonly '~required': true;
    } ? K : never;
}[keyof TFields];
type WritableKeys<TFields> = Exclude<keyof TFields, keyof SystemFields | KeysWhere<TFields, RelationField>>;
type InputValue<TField> = TField extends ScalarField ? ScalarValueOf<TField> : TField extends PointerField ? {
    readonly connect: string;
} : never;
type CreateFields<TFields> = {
    readonly [K in WritableKeys<TFields> & RequiredKeys<TFields>]: InputValue<TFields[K]>;
} & {
    readonly [K in Exclude<WritableKeys<TFields>, RequiredKeys<TFields>>]?: InputValue<TFields[K]>;
};
/** Create input: required fields are mandatory, pointers connect by id. */
export type CreateInput<TSchema> = CreateFields<FieldsOf<TSchema>>;
/** Record seen by hooks: exact stored values with pointer identities. */
export type Item<TSchema> = Result<TSchema, Readonly<Record<never, never>>>;
export {};

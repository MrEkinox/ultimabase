// Minimal schema model shared by the TS7 behaviour repros: scalar and pointer
// fields, a `where` builder that follows pointers to other schemas, rules with a
// filter and a hook. Schemas expose `'~fields'` (D and K: on the constant; E: as
// an inherited static of the class).
export interface Scalar<T> {
	readonly kind: 'scalar'
	readonly '~value': T
}
export interface Pointer<TTarget> {
	readonly kind: 'pointer'
	readonly target: TTarget
}
export const str: Scalar<string> = { kind: 'scalar', '~value': '' }
export const bool: Scalar<boolean> = { kind: 'scalar', '~value': false }
export const pointer = <TTarget>(target: TTarget): Pointer<TTarget> => ({ kind: 'pointer', target })

type FieldsOf<TSchema> = TSchema extends { readonly '~fields': infer TFields } ? TFields : never
type TargetOf<TField> = TField extends Pointer<() => infer TTarget> ? TTarget : never
export type ScalarKeys<TSchema> = { [K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends Scalar<unknown> ? K : never }[keyof FieldsOf<TSchema>] & string
export type PointerKeys<TSchema> = { [K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends Pointer<unknown> ? K : never }[keyof FieldsOf<TSchema>] & string
type ValueOf<TField> = TField extends Scalar<infer TValue> ? TValue : never
export type Item<TSchema> = { readonly [K in ScalarKeys<TSchema>]: ValueOf<FieldsOf<TSchema>[K]> }

type NameOf<TSchema> = TSchema extends { readonly '~name': infer TName extends string } ? TName : never
/** Filter expression, keyed by schema name (not by schema type, which would make rules part of the cycle). */
export interface Expr<TName extends string> {
	readonly '~expr': TName
}
/** Filter builder bound to one schema. */
export interface WhereBuilder<TSchema> {
	eq<K extends ScalarKeys<TSchema>>(key: K, value: ValueOf<FieldsOf<TSchema>[K]>): Expr<NameOf<TSchema>>
	is<K extends PointerKeys<TSchema>>(key: K, target: (where: WhereBuilder<TargetOf<FieldsOf<TSchema>[K]>>) => Expr<NameOf<TargetOf<FieldsOf<TSchema>[K]>>>): Expr<NameOf<TSchema>>
}
/** Rules of one schema (what plugins contribute in the real model). */
export interface Rules<TSchema> {
	readonly where?: (where: WhereBuilder<TSchema>) => Expr<NameOf<TSchema>>
	readonly beforeUpdate?: (item: Item<TSchema>) => void
}

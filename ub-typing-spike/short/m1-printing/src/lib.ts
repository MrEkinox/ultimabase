// Printing micro-experiments for short D hovers (section 9).
export interface Scalar<V> { readonly kind: 'scalar'; readonly '~v': V }
export interface Ptr<T> { readonly kind: 'pointer'; readonly '~t': T }
export type FieldsOf<S> = S extends { readonly '~fields': infer F } ? F : never
export type NameOf<S> = S extends { readonly className: infer N extends string } ? N : never
type TargetOf<P> = P extends Ptr<infer T> ? (T extends () => infer S ? S : never) : never
type ScalarKeys<S> = { [K in keyof FieldsOf<S>]: FieldsOf<S>[K] extends Scalar<unknown> ? K : never }[keyof FieldsOf<S>] & string
type PointerKeys<S> = { [K in keyof FieldsOf<S>]: FieldsOf<S>[K] extends Ptr<unknown> ? K : never }[keyof FieldsOf<S>] & string
type ValueOf<S, K extends keyof FieldsOf<S>> = FieldsOf<S>[K] extends Scalar<infer V> ? V : never
export interface Expr<N extends string> { readonly '~expr': N }
export interface WhereBuilder<S> {
	eq<K extends ScalarKeys<S>>(k: K, v: ValueOf<S, K>): Expr<NameOf<S>>
	is<K extends PointerKeys<S>>(k: K, t: (w: WhereBuilder<TargetOf<FieldsOf<S>[K]>>) => Expr<NameOf<TargetOf<FieldsOf<S>[K]>>>): Expr<NameOf<S>>
}
export interface Opts<S> { readonly read?: (ctx: { readonly where: WhereBuilder<S> }) => Expr<NameOf<S>> }
export interface FieldBuilder {
	string(): Scalar<string>
	boolean(): Scalar<boolean>
	pointer<const T extends object>(o: { target: T }): Ptr<T>
}

// Idea 2a: named interface return (`DeclaredSchema<'Todo', F>`).
export interface DeclaredSchema<N extends string, F> {
	readonly className: N
	readonly '~fields': F
	with(options: Opts<this>): this
}
export declare const declareA: <const N extends string, const F>(d: { className: N; fields: (f: FieldBuilder) => F }) => DeclaredSchema<N, F>

// Idea 2b: declared generic class, instance side returned.
export declare class SchemaInstance<N extends string, F> {
	readonly className: N
	readonly '~fields': F
	with(options: Opts<this>): this
}
export declare const declareB: <const N extends string, const F>(d: { className: N; fields: (f: FieldBuilder) => F }) => SchemaInstance<N, F>

// Idea 3: opaque wrapper; the fields hidden behind a thunk member.
export interface Opaque<N extends string> { readonly className: N }
export type Wrapped<N extends string, F> = Opaque<N> & { readonly '~fields': F; with(options: Opts<Opaque<N> & { readonly '~fields': F }>): Wrapped<N, F> }
export declare const declareC: <const N extends string, const F>(d: { className: N; fields: (f: FieldBuilder) => F }) => Wrapped<N, F>

// Idea 4: generic callback; the schema is a type parameter constrained by the complete schema.
export interface GenericOpts<S> { readonly read?: <TSchema extends S>(ctx: { readonly where: WhereBuilder<TSchema> }) => Expr<NameOf<S>> }
export interface GenericSchema<N extends string, F> {
	readonly className: N
	readonly '~fields': F
	with(options: GenericOpts<this>): this
}
export declare const declareD: <const N extends string, const F>(d: { className: N; fields: (f: FieldBuilder) => F }) => GenericSchema<N, F>

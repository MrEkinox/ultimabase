// Minimal model used only to find which shapes create TypeScript initializer cycles.
export interface Scalar<V> { readonly kind: 'scalar'; readonly '~v': V }
export interface PtrT<T> { readonly kind: 'pointer'; readonly '~t': T }   // eager target
export interface PtrF<F> { readonly kind: 'pointer'; readonly '~f': F }   // deferred thunk type
export type TargetOf<P> = P extends PtrT<infer T> ? T : P extends PtrF<infer F> ? (F extends () => infer T ? T : never) : never
export interface Schema<N extends string, F> { readonly name: N; readonly '~fields': F }
export type FieldsOf<S> = S extends Schema<string, infer F> ? F : never
export type Where<F> = { readonly [K in keyof F]?: F[K] extends Scalar<infer V> ? V : F[K] extends PtrT<unknown> | PtrF<unknown> ? Where<FieldsOf<TargetOf<F[K]>>> : never }
export const field = {
	string: (): Scalar<string> => ({ kind: 'scalar' }) as Scalar<string>,
	boolean: (): Scalar<boolean> => ({ kind: 'scalar' }) as Scalar<boolean>,
	pointerT: <T>(t: () => T): PtrT<T> => ({ kind: 'pointer', t }) as unknown as PtrT<T>,
	pointerF: <F>(t: F): PtrF<F> => ({ kind: 'pointer', t }) as unknown as PtrF<F>,
}
type Field = typeof field
export interface Opts<F> { readonly where?: (w: Where<F>) => Where<F> }
export interface VoidOpts<F> { readonly beforeSave?: (record: Where<F>) => void }
export const define = <const N extends string, const F>(name: N, fields: (f: Field) => F, opts?: NoInfer<Opts<F>>): Schema<N, F> => ({ name, fields, opts }) as unknown as Schema<N, F>
export const defineVoid = <const N extends string, const F>(name: N, fields: (f: Field) => F, opts?: NoInfer<VoidOpts<F>>): Schema<N, F> => ({ name, fields, opts }) as unknown as Schema<N, F>
export const defineThis = <const N extends string, const F, const O>(name: N, fields: (f: Field) => F, opts?: O & ThisType<{ where: Where<F> }>): Schema<N, F> => ({ name, fields, opts }) as unknown as Schema<N, F>
// E6: two-phase `.with()` returning the same schema type.
export interface Schema2<N extends string, F> extends Schema<N, F> { with(opts: Opts<F>): Schema2<N, F> }
export const define2 = <const N extends string, const F>(name: N, fields: (f: Field) => F): Schema2<N, F> => ({ name, fields }) as unknown as Schema2<N, F>
// E7: class base; options as static members resolved lazily per member.
export interface SchemaClass<N extends string, F> { readonly name: N; readonly '~fields': F; new (): { readonly '~fields': F } }
export const base = <const N extends string, const F>(name: N, fields: (f: Field) => F): SchemaClass<N, F> => class { static '~fields' = fields } as unknown as SchemaClass<N, F>
export const rules = <S extends { readonly '~fields': unknown }>(s: S, opts: Opts<S['~fields']>): Opts<S['~fields']> => opts
// E9: callbacks contextually typed by a void-returning constraint; exact options type retained for later validation.
export interface LooseOpts<F> { readonly where?: (w: Where<F>) => void }
export interface Schema9<N extends string, F, O> extends Schema<N, F> { readonly '~opts': O }
export const define9 = <const N extends string, const F, const O extends LooseOpts<F>>(name: N, fields: (f: Field) => F, opts?: O): Schema9<N, F, O> => ({ name, fields, opts }) as unknown as Schema9<N, F, O>
type CheckOne<S> = S extends Schema9<string, infer F, infer O> ? (O extends { readonly where?: (w: Where<F>) => Where<F> } ? S : { error: 'where must return Where'; schema: S['name'] }) : S
export const app9 = <const L extends readonly unknown[]>(schemas: { [K in keyof L]: CheckOne<L[K]> }): L => schemas as unknown as L
// E10: string targets resolved through a developer-declared registry (TanStack Router `Register` style).
export interface Register {}
type Reg = Register extends { readonly schemas: infer L extends readonly unknown[] } ? { [S in L[number] as S extends { readonly name: infer N extends string } ? N : never]: S } : Record<string, never>
export interface PtrS<N extends string> { readonly kind: 'pointer'; readonly '~n': N }
export type WhereS<F> = { readonly [K in keyof F]?: F[K] extends Scalar<infer V> ? V : F[K] extends PtrS<infer N> ? (N extends keyof Reg ? WhereS<FieldsOf<Reg[N]>> : never) : never }
export const fieldS = { string: field.string, pointer: <const N extends keyof Reg & string>(n: N): PtrS<N> => ({ n }) as unknown as PtrS<N> }
export const defineS = <const N extends string, const F>(name: N, fields: (f: typeof fieldS) => F, opts?: NoInfer<{ where?: (w: WhereS<F>) => WhereS<F> }>): Schema<N, F> => ({ name, fields, opts }) as unknown as Schema<N, F>
export const appS = <const L extends readonly unknown[]>(schemas: L): { readonly schemas: L } => ({ schemas })
// E11: options as a callback inside the single generic define call.
export const define11 = <const N extends string, const F>(name: N, fields: (f: Field) => F, opts?: (s: { where: Where<F> }) => NoInfer<Opts<F>>): Schema<N, F> => ({ name, fields, opts }) as unknown as Schema<N, F>
// E10c: unconstrained string targets; the registry is read lazily only inside WhereS2.
type Reg2 = Register extends { readonly schemas: infer L extends readonly unknown[] } ? { [S in L[number] as S extends { readonly name: infer N extends string } ? N : never]: S } : Record<string, never>
export type WhereS2<F> = { readonly [K in keyof F]?: F[K] extends Scalar<infer V> ? V : F[K] extends PtrS<infer N> ? (N extends keyof Reg2 ? WhereS2<FieldsOf<Reg2[N]>> : { error: `unknown schema ${N}` }) : never }
export const fieldS2 = { string: field.string, pointer: <const N extends string>(n: N): PtrS<N> => ({ n }) as unknown as PtrS<N> }
export interface SchemaS<N extends string, F> extends Schema<N, F> { with(opts: { where?: (w: WhereS2<F>) => WhereS2<F> }): SchemaS<N, F> }
export const defineS2 = <const N extends string, const F>(name: N, fields: (f: typeof fieldS2) => F): SchemaS<N, F> => ({ name, fields }) as unknown as SchemaS<N, F>
export const appS2 = <const L extends readonly unknown[]>(schemas: L): { readonly schemas: L } => ({ schemas })

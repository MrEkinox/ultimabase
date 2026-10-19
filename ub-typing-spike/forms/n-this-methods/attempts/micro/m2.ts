interface FB { string(): { kind: 'string' }; boolean(): { kind: 'boolean' } }
interface Ctx<F> { readonly keys: keyof F; eq(key: keyof F & string): { brand: 'expr' } }
type Rules<F> = { readonly access?: { readonly read?: (this: Ctx<F>) => { brand: 'expr' } } } & { readonly hooks?: { readonly beforeSave?: (this: { item: F }) => void } }
type ShapeDecl = { readonly softDelete?: boolean }
type Added<S> = S extends { readonly softDelete: true } ? { isDeleted: { kind: 'boolean' } } : {}
type NoExtraKeys<T, A> = { readonly [K in Exclude<keyof T, A>]: never }
// E: TShape inferred from the whole declaration, rules depend on TFields only
declare function defineE<const N extends string, const F, const S extends ShapeDecl = {}>(d: { className: N; fields: (f: FB) => F } & S & Rules<F>): F & Added<S>
export const e = defineE({ className: 'E', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('archived') } } })
// F: rules depend on TFields & Added<TShape>
declare function defineF<const N extends string, const F, const S extends ShapeDecl = {}>(d: { className: N; fields: (f: FB) => F } & S & Rules<F & Added<S>>): F & Added<S>
export const f = defineF({ className: 'F', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('isDeleted') } }, hooks: { beforeSave() { this.item.isDeleted } } })
// G: F plus NoExtraKeys
declare function defineG<const N extends string, const F, const S extends ShapeDecl = {}>(d: { className: N; fields: (f: FB) => F } & S & NoExtraKeys<S, 'className' | 'fields' | 'softDelete' | 'access' | 'hooks'> & Rules<F & Added<S>>): F & Added<S>
export const g = defineG({ className: 'G', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('isDeleted') } }, hooks: { beforeSave() { this.item.isDeleted } } })
// H: no shape option at all, rules depend on F only, no S
declare function defineH<const N extends string, const F>(d: { className: N; fields: (f: FB) => F } & Rules<F>): F
export const h = defineH({ className: 'H', fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('archived') } }, hooks: { beforeSave() { this.item.title } } })

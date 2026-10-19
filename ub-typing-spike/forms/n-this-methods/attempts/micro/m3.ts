interface FB { string(): { kind: 'string' }; boolean(): { kind: 'boolean' } }
interface Ctx<F> { readonly keys: keyof F; eq(key: keyof F & string): { brand: 'expr' } }
type Rules<F> = { readonly access?: { readonly read?: (this: Ctx<F>) => { brand: 'expr' } } } & { readonly hooks?: { readonly beforeSave?: (this: { item: F }) => void } }
type ShapeDecl = { readonly softDelete?: boolean }
type Added<S> = S extends { readonly softDelete: true } ? { isDeleted: { kind: 'boolean' } } : {}
// F2: NoInfer on S inside the rules
declare function defineF2<const N extends string, const F, const S extends ShapeDecl = {}>(d: { className: N; fields: (f: FB) => F } & S & Rules<F & Added<NoInfer<S>>>): F & Added<S>
export const f2 = defineF2({ className: 'F', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('isDeleted') } }, hooks: { beforeSave() { this.item.isDeleted } } })
// F5: S without default
declare function defineF5<const N extends string, const F, const S extends ShapeDecl>(d: { className: N; fields: (f: FB) => F } & S & Rules<F & Added<S>>): F & Added<S>
export const f5 = defineF5({ className: 'F', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('isDeleted') } }, hooks: { beforeSave() { this.item.isDeleted } } })
// F6: shape value inferred through a dedicated mapped property type (one param per shape key is not generic; here a
// mapped homomorphic type over the installed shapes, inferred by reverse mapping)
type ShapeParams<S> = { readonly [K in keyof S]: S[K] }
declare function defineF6<const N extends string, const F, const S extends ShapeDecl>(d: { className: N; fields: (f: FB) => F } & ShapeParams<S> & Rules<F & Added<S>>): F & Added<S>
export const f6 = defineF6({ className: 'F', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('isDeleted') } }, hooks: { beforeSave() { this.item.isDeleted } } })
// F7: methods without `this` usage in the shape-dependent part? (hooks reads isDeleted through a parameter instead)
type Rules7<F> = { readonly access?: { readonly read?: (this: Ctx<F>) => { brand: 'expr' } } } & { readonly hooks?: { readonly beforeSave?: (args: { item: F }) => void } }
declare function defineF7<const N extends string, const F, const S extends ShapeDecl = {}>(d: { className: N; fields: (f: FB) => F } & S & Rules7<F & Added<S>>): F & Added<S>
export const f7 = defineF7({ className: 'F', softDelete: true, fields: (f) => ({ title: f.string(), archived: f.boolean() }), hooks: { beforeSave({ item }) { item.isDeleted } } })

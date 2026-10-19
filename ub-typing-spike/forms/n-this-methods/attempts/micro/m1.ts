// Does `this` in a rules method see fields inferred from the earlier `fields` callback of the same call?
interface FB { string(): { kind: 'string' }; boolean(): { kind: 'boolean' } }
interface Ctx<F> { readonly keys: keyof F; eq(key: keyof F & string): { brand: 'expr' } }
// A: explicit `this` parameter in a function-typed property
declare function defineA<const N extends string, const F>(d: { className: N; fields: (f: FB) => F; access?: { read?: (this: Ctx<F>) => { brand: 'expr' } } }): F
export const a = defineA({ className: 'A', fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('archived') } } })
// B: ThisType marker on the rules object
declare function defineB<const N extends string, const F>(d: { className: N; fields: (f: FB) => F; access?: { read?: () => { brand: 'expr' } } & ThisType<Ctx<F>> }): F
export const b = defineB({ className: 'B', fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('archived') } } })
// C: fields as a plain object (not a callback, not context-sensitive), `this` parameter
declare const f: FB
declare function defineC<const N extends string, const F>(d: { className: N; fields: F; access?: { read?: (this: Ctx<F>) => { brand: 'expr' } } }): F
export const c = defineC({ className: 'C', fields: { title: f.string(), archived: f.boolean() }, access: { read() { return this.eq('archived') } } })
// D: as A but the rules type wrapped in an intersection (as the plugin HKT tuple produces)
type Rules<F> = { readonly access?: { readonly read?: (this: Ctx<F>) => { brand: 'expr' } } } & { readonly hooks?: { readonly beforeSave?: (this: { item: F }) => void } }
declare function defineD<const N extends string, const F>(d: { className: N; fields: (f: FB) => F } & Rules<F>): F
export const d = defineD({ className: 'D', fields: (f) => ({ title: f.string(), archived: f.boolean() }), access: { read() { return this.eq('archived') } } })

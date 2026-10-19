interface FB { string(): { kind: 'string' }; boolean(): { kind: 'boolean' } }
interface Ctx<F> { readonly keys: keyof F; eq(key: keyof F & string): { brand: 'expr' } }
type Rules<F> = { readonly access?: { readonly read?: (this: Ctx<F>) => { brand: 'expr' } } } & { readonly hooks?: { readonly beforeSave?: (this: { item: F }) => void } }
type ShapeDecl = { readonly softDelete?: boolean }
type Added<S> = S extends { readonly softDelete: true } ? { isDeleted: { kind: 'boolean' } } : {}
type ShapeParams<S> = { readonly [K in keyof S]: S[K] }
type NoExtraKeys<T, A> = { readonly [K in Exclude<keyof T, A>]: never }
declare function define<const N extends string, const F, const S extends ShapeDecl>(
	d: { className: N; fields: (f: FB) => F } & ShapeParams<S> & NoExtraKeys<S, 'className' | 'fields' | 'softDelete' | 'access' | 'hooks'> & Rules<F & Added<S>>,
): F & Added<S>
export const yes = define({ className: 'Y', softDelete: true, fields: (f) => ({ title: f.string() }), access: { read() { return this.eq('isDeleted') } }, hooks: { beforeSave() { this.item.isDeleted } } })
export const no = define({ className: 'N', fields: (f) => ({ title: f.string() }), access: { read() { return this.eq('title') } } })
type Check<T extends true> = T
export type C1 = Check<'isDeleted' extends keyof typeof yes ? true : false>
export type C2 = Check<'isDeleted' extends keyof typeof no ? false : true>
// expected errors below
export const noShape = define({ className: 'N2', fields: (f) => ({ title: f.string() }), hooks: { beforeSave() { this.item.isDeleted } } })
export const typo = define({ className: 'T', sofDelete: true, fields: (f) => ({ title: f.string() }) })
export const badKey = define({ className: 'B', fields: (f) => ({ title: f.string() }), acess: { read() { return this.eq('title') } } })
export const badField = define({ className: 'B2', fields: (f) => ({ title: f.string() }), access: { read() { return this.eq('titel') } } })
export const badReturn = define({ className: 'B3', fields: (f) => ({ title: f.string() }), access: { read() { return 42 } } })

interface F { str(): { k: 'string' } }
interface Decl<N extends string, T> { readonly className: N; readonly fields: (field: F) => T }
interface ShapeOpts { readonly softDelete?: boolean }
type Added<S> = S extends { readonly softDelete: true } ? { isDeleted: true } : {}
declare function define<const N extends string, const T, const S extends ShapeOpts = {}>(d: Decl<N, T> & S): { n: N; f: T & Added<S>; s: S }
export const a = define({ className: 'A', softDelete: true, fields: (field) => ({ x: field.str() }) })
export const b = define({ className: 'B', fields: (field) => ({ x: field.str() }) })
export const c = define({ className: 'C', sofDelete: true, fields: (field) => ({ x: field.str() }) })
// variant 2: exact keys
type NoExtra<S, K extends PropertyKey> = { readonly [P in Exclude<keyof S, K | 'className' | 'fields'>]: never }
declare function define2<const N extends string, const T, const S extends ShapeOpts = {}>(d: Decl<N, T> & S & NoExtra<S, keyof ShapeOpts>): { n: N; f: T & Added<S>; s: S }
export const d = define2({ className: 'D', sofDelete: true, fields: (field) => ({ x: field.str() }) })
export const e = define2({ className: 'E', softDelete: true, fields: (field) => ({ x: field.str() }) })
// variant 3: shape keys spelled in the declaration interface (exact excess check), value captured by a second param inferred from the same object
declare function define3<const N extends string, const T, const S extends ShapeOpts = {}>(d: Decl<N, T> & ShapeOpts & S): { n: N; f: T & Added<S>; s: S }
export const f = define3({ className: 'F', sofDelete: true, fields: (field) => ({ x: field.str() }) })
export const g = define3({ className: 'G', softDelete: true, fields: (field) => ({ x: field.str() }) })

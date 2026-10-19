interface F { str(): { k: 'string' } }
interface Decl<N extends string, T> { readonly className: N; readonly fields: (field: F) => T }
interface ShapeOpts { readonly softDelete?: boolean }
type Added<S> = S extends { readonly softDelete: true } ? { isDeleted: true } : {}
/** Unknown keys are mapped to an explanatory never-like type. */
type KnownKeys<S, TAllowed> = { readonly [P in Exclude<keyof S, keyof TAllowed | 'className' | 'fields'>]: `unknown schema option` }
declare function define4<const N extends string, const T, const S extends object>(d: Decl<N, T> & ShapeOpts & S & KnownKeys<S, ShapeOpts>): { n: N; f: T & Added<S> }
export const h = define4({ className: 'H', sofDelete: true, fields: (field) => ({ x: field.str() }) })
export const i = define4({ className: 'I', softDelete: true, fields: (field) => ({ x: field.str() }) })
export const j = define4({ className: 'J', softDelete: 1, fields: (field) => ({ x: field.str() }) })
export const k = define4({ className: 'K', fields: (field) => ({ x: field.str() }) })

interface F { str(): { k: 'string' } }
interface Decl<N extends string, T> { readonly className: N; readonly fields: (field: F) => T }
interface ShapeOpts { readonly softDelete?: boolean }
type Added<S> = S extends { readonly softDelete: true } ? { isDeleted: true } : {}
interface UnknownOption<P extends PropertyKey> { readonly '~unknownSchemaOption': P }
type ShapeCheck<S> = { readonly [P in keyof S]: P extends 'className' | 'fields' ? S[P] : P extends keyof ShapeOpts ? S[P] : UnknownOption<P> }
// A: whole declaration generic
interface DeclLike { readonly className: string; readonly fields: (field: F) => unknown }
declare function defineA<const D extends DeclLike & ShapeOpts>(d: D & ShapeCheck<D>): { n: D['className']; f: ReturnType<D['fields']> & Added<D> }
export const a1 = defineA({ className: 'A1', sofDelete: true, fields: (field) => ({ x: field.str() }) })
export const a2 = defineA({ className: 'A2', softDelete: true, fields: (field) => ({ x: field.str() }) })
export const a3 = defineA({ className: 'A3', softDelete: 1, fields: (field) => ({ x: field.str() }) })
export const a4 = defineA({ className: 'A4', fields: (field) => ({ x: field.str() }) })
// B: separate N/T + S only through check
declare function defineB<const N extends string, const T, const S extends object>(d: Decl<N, T> & ShapeOpts & ShapeCheck<S> & Partial<S>): { n: N; f: T & Added<S> }
export const b1 = defineB({ className: 'B1', sofDelete: true, fields: (field) => ({ x: field.str() }) })
export const b2 = defineB({ className: 'B2', softDelete: true, fields: (field) => ({ x: field.str() }) })
export const b3 = defineB({ className: 'B3', softDelete: 1, fields: (field) => ({ x: field.str() }) })
export const b4 = defineB({ className: 'B4', fields: (field) => ({ x: field.str() }) })

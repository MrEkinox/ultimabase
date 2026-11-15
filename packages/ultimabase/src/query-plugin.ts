// A plugin field type's fields in a query (D-122, D-404).
import type { fieldType } from './symbols.ts'

/** Whether a field is a list, the kernel's or one a field type took. */
export type IsList<X> = X extends {
	readonly [fieldType]: { readonly options: { readonly list: true } }
}
	? true
	: false

/** A plugin field type's stored field (D-122), `never` for a kernel one. */
export type StoredOf<X> = X extends {
	readonly [fieldType]: { readonly stored: infer S }
}
	? S
	: never
/** The fields of a plugin field type. */
export type PluginKeys<F> = {
	[K in keyof F]: [StoredOf<F[K]>] extends [never] ? never : K
}[keyof F]

/** Its list fields, never `null`: no `where` names them (D-404). */
export type PluginListKeys<F> = {
	[K in PluginKeys<F>]: IsList<F[K]> extends true ? K : never
}[PluginKeys<F>]

/**
 * A plugin field's filter outside a `beforeFind`: its presence alone
 * (D-404). A field's options hold its stored field's, so a list is either
 * list.
 */
export type Presence = null | { readonly not: null }

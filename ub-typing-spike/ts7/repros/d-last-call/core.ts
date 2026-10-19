import type { Rules, Scalar } from '../common/mini.ts'

/** D: shape methods first, then ONE final non-generic `.with(rules)`. */
export interface Defined<TName extends string, TFields> {
	readonly '~name': TName
	readonly '~fields': TFields
	softDelete(): Defined<TName, TFields & { readonly isDeleted: Scalar<boolean> }>
	with(rules: Rules<Defined<TName, TFields>>): Configured<TName, TFields>
}
export interface Configured<TName extends string, TFields> {
	readonly '~name': TName
	readonly '~fields': TFields
	readonly configured: true
}
// Type-level repro: no implementation needed.
export declare const define: <const TName extends string, TFields>(name: TName, fields: () => TFields) => Defined<TName, TFields>

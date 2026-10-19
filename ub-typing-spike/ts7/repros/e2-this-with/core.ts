import type { Rules } from '../common/mini.ts'

export interface SchemaRules<TSchema> {
	readonly '~rules': TSchema
}
/** E2: `static options = this.with({...})`; TSelf is inferred from the receiver only. */
export interface SchemaClass<TName extends string, TFields> {
	new (): object
	readonly '~name': TName
	readonly '~fields': TFields
	with<TSelf>(this: TSelf, options: Rules<TSelf>): SchemaRules<TSelf>
}
// Type-level repro: no implementation needed.
export declare const Schema: <const TName extends string, TFields>(name: TName, fields: () => TFields) => SchemaClass<TName, TFields>

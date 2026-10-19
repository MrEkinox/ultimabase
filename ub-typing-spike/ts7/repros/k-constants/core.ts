import type { Rules } from '../common/mini.ts'

export interface SchemaRules<TName extends string> {
	readonly '~rules': TName
}
/** K: the schema constant has no rules; `X.rules({...})` is a separate, non-generic call. */
export interface Defined<TName extends string, TFields> {
	readonly '~name': TName
	readonly '~fields': TFields
	rules(rules: Rules<Defined<TName, TFields>>): SchemaRules<TName>
}
// Type-level repro: no implementation needed.
export declare const define: <const TName extends string, TFields>(name: TName, fields: () => TFields) => Defined<TName, TFields>

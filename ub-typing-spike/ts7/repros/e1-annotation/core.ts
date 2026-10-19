import type { Rules } from '../common/mini.ts'

export interface SchemaRules<TSchema> {
	readonly '~rules': TSchema
}
/** E1: `static readonly options: Rules<typeof X> = {...}` (no call). */
export interface SchemaClass<TName extends string, TFields> {
	new (): object
	readonly '~name': TName
	readonly '~fields': TFields
}
// Type-level repro: no implementation needed.
export declare const Schema: <const TName extends string, TFields>(name: TName, fields: () => TFields) => SchemaClass<TName, TFields>

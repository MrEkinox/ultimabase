// Stand-ins for the plugins and the storage adapter the measured models use
// (D-24): each plugin value carries its types.
import type { Queries, UniqueWhere } from './query.ts'
import type { RecordOf, ScalarKeys } from './record.ts'
import type { AnyRule } from './rules.ts'
import type { Database, FromModel, Plugin } from './ultimabase.ts'

/** The commands soft delete adds (D-15, D-17). */
export interface SoftDeleteCommands<F> {
	readonly trash: Queries<F>
	restore(args: { readonly where: UniqueWhere<F> }): Promise<RecordOf<F>>
}

interface SoftDeleteModel extends FromModel {
	readonly out: this['options'] extends true
		? SoftDeleteCommands<this['fields']>
		: unknown
}

type AclKey<F> = {
	readonly default?: { readonly read?: AnyRule; readonly write?: AnyRule }
	readonly ownerField?: ScalarKeys<F>
}

interface AclWith extends FromModel {
	readonly out: AclKey<this['fields']>
}

interface GraphqlWith extends FromModel {
	readonly out: { readonly name?: string }
}

export declare function softDelete(): Plugin<{
	readonly name: 'softDelete'
	readonly option: boolean
	readonly commands: SoftDeleteModel
}>
export declare function acl(): Plugin<{
	readonly name: 'acl'
	readonly with: AclWith
}>
export declare function graphql(): Plugin<{
	readonly name: 'graphql'
	readonly with: GraphqlWith
}>
export declare function memory(): Database
export declare function postgres(): Database

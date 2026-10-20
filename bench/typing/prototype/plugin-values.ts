// Stand-ins for the plugins and the storage adapter the measured models use
// (D-24): each plugin exports its application value and its model entry, and
// the entry carries the plugin's types.
import type { Queries, UniqueWhere } from './query.ts'
import type { RecordOf, ScalarKeys } from './record.ts'
import type { AnyRule } from './rules.ts'
import type {
	Database,
	FromModel,
	ModelUse,
	PluginValue,
} from './ultimabase.ts'

/** The commands soft delete adds (D-15, D-17). */
export interface SoftDeleteCommands<F> {
	readonly trash: Queries<F>
	restore(args: { readonly where: UniqueWhere<F> }): Promise<RecordOf<F>>
}

interface SoftDeleteModel extends FromModel {
	readonly out: SoftDeleteCommands<this['fields']>
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

export declare function softDeletePlugin(): PluginValue<'softDelete'>
export declare function softDelete(): ModelUse<
	'softDelete',
	{ readonly commands: SoftDeleteModel }
>
export declare function aclPlugin(): PluginValue<'acl'>
export declare function acl(): ModelUse<'acl', { readonly with: AclWith }>
export declare function graphqlPlugin(): PluginValue<'graphql'>
export declare function graphql(): ModelUse<
	'graphql',
	{ readonly with: GraphqlWith }
>
export declare function memory(): Database
export declare function postgres(): Database

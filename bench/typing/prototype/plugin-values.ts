// The plugins the measured models use, written as their authors would
// (D-57, form 1): an interface holds the types, `definePlugin` the code.
import type { Field } from './fields.ts'
import type { Queries, UniqueWhere } from './query.ts'
import type { RecordOf, ScalarKeys } from './record.ts'
import type { AnyRule } from './rules.ts'
import type { Database, PluginOf, PluginTypes, UseOf } from './ultimabase.ts'
import { definePlugin } from './ultimabase.ts'

// Stand-ins for the plugin's runtime.
declare function deletedOnly<F>(model: Queries<F>): Queries<F>
declare function undelete<F>(
	model: Queries<F>,
	where: UniqueWhere<F>,
): Promise<RecordOf<F>>

/** The commands soft delete adds (D-15, D-17). */
export interface SoftDeleteCommands<F> {
	readonly trash: Queries<F>
	restore(args: { readonly where: UniqueWhere<F> }): Promise<RecordOf<F>>
}
/** The field soft delete adds, `deletedAt` unless the entry renames it. */
type DeletedField<O> = {
	readonly [
		K in O extends { readonly field: infer N extends string } ? N : 'deletedAt'
	]: Field<Date, { readonly optional: true }>
}

interface SoftDelete extends PluginTypes {
	readonly name: 'softDelete'
	readonly options: { readonly field?: string }
	readonly appOptions: { readonly purgeAfterDays?: number }
	readonly adds: DeletedField<this['options']>
	readonly commands: SoftDeleteCommands<this['fields']>
}

const softDeleteDefinition = definePlugin<SoftDelete>({
	name: 'softDelete',
	manifest: { name: 'ultimabase-soft-delete', version: '1.0.0' },
	hooks: {
		// Deleted rows do not exist, except through `trash` (D-17, D-71). The
		// code sees the default field name; a renamed one needs a cast (D-57).
		beforeFind: ({ where, command }) =>
			where({ deletedAt: command === 'trash' ? { not: null } : null }),
	},
	commands: ({ queries }) => ({
		trash: deletedOnly(queries),
		restore: ({ where }) => undelete(queries, where),
	}),
})
export const softDelete: UseOf<SoftDelete> = softDeleteDefinition.use
export const softDeletePlugin: PluginOf<SoftDelete> =
	softDeleteDefinition.plugin

interface AclKey<F> {
	readonly default?: { readonly read?: AnyRule; readonly write?: AnyRule }
	readonly ownerField?: ScalarKeys<F>
	readonly check?: (record: RecordOf<F>) => boolean
}

/** The ACL rule of one field, typed by its value (D-12). */
export interface AclField<V> {
	readonly roles?: readonly string[]
	readonly check?: (value: V) => boolean
}

interface Acl extends PluginTypes {
	readonly name: 'acl'
	readonly with: AclKey<this['fields']>
	readonly fieldWith: AclField<this['value']>
}

const aclDefinition = definePlugin<Acl>({
	name: 'acl',
	manifest: { name: 'ultimabase-acl', version: '1.0.0' },
})
export const acl: UseOf<Acl> = aclDefinition.use
export const aclPlugin: PluginOf<Acl> = aclDefinition.plugin

interface Graphql extends PluginTypes {
	readonly name: 'graphql'
	readonly with: { readonly name?: string }
	readonly functionWith: { readonly name?: string } | false
}

const graphqlDefinition = definePlugin<Graphql>({
	name: 'graphql',
	manifest: { name: 'ultimabase-graphql', version: '1.0.0' },
})
export const graphql: UseOf<Graphql> = graphqlDefinition.use
export const graphqlPlugin: PluginOf<Graphql> = graphqlDefinition.plugin

export declare function memory(): Database
export declare function postgres(): Database

// Stand-ins for plugins not built yet, written as their authors would
// (D-57, form 1): ACL in Phase 7, GraphQL in Phase 4. Their types use kernel
// internals the kernel exports only when those phases need them.
import type { PluginOf, PluginTypes, RecordOf, UseOf } from 'ultimabase'
import { definePlugin } from 'ultimabase'
import type { ScalarKeys } from '../../../packages/ultimabase/src/record.ts'
import type { AnyRule } from '../../../packages/ultimabase/src/rules.ts'

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
